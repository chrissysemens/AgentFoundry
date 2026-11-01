import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SQLiteJournal } from "../src/journal.ts";

describe("SQLite privileged merge write boundary", () => {
  it("rejects direct conditional merge writes on ordinary journals", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentfoundry-merge-"));
    const journal = new SQLiteJournal(join(dir, "journal.sqlite"));
    try {
      expect(() =>
        journal.appendIfLastEventMatches(
          "FOUND-002",
          "forged-snapshot",
          "MERGE_AUTHORIZED",
          "human:123",
          {},
        ),
      ).toThrow("Privileged merge writes disabled for this journal");
      expect(journal.read("FOUND-002")).toEqual([]);
    } finally {
      journal.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
