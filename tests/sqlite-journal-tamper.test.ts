import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SQLiteJournal } from "../src/journal.ts";

describe("SQLite journal tamper resistance", () => {
  it("rejects direct updates and deletes through a separate database connection", () => {
    const directory = mkdtempSync(join(tmpdir(), "foundry-tamper-"));
    const path = join(directory, "events.sqlite");
    const journal = new SQLiteJournal(path);
    let external: DatabaseSync | undefined;
    try {
      journal.append("ticket", "TICKET_CREATED", "human:owner", {
        title: "Original",
      });
      external = new DatabaseSync(path);
      expect(() =>
        external?.prepare("UPDATE events SET event_json=? WHERE ticket_id=?").run(
          '{"forged":true}',
          "ticket",
        ),
      ).toThrow("append only");
      expect(() =>
        external?.prepare("DELETE FROM events WHERE ticket_id=?").run("ticket"),
      ).toThrow("append only");
      expect(journal.read("ticket")).toHaveLength(1);
      expect(journal.read("ticket")[0]?.payload.title).toBe("Original");
    } finally {
      external?.close();
      journal.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
