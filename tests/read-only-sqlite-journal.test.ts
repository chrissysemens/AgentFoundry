import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SQLiteJournal } from "../src/journal.ts";
import { ReadOnlySQLiteJournal } from "../src/read-only-sqlite-journal.ts";

describe("read-only SQLite journal consumer", () => {
  it("reads committed events without exposing append or privileged merge methods", () => {
    const dir = mkdtempSync(join(tmpdir(), "foundry-readonly-"));
    const path = join(dir, "events.sqlite");
    const writer = new SQLiteJournal(path);
    let reader: ReadOnlySQLiteJournal | undefined;
    try {
      writer.append("ticket", "TICKET_CREATED", "human:owner", { title: "Original" });
      reader = new ReadOnlySQLiteJournal(path);
      expect(reader.read("ticket")).toEqual(writer.read("ticket"));
      expect("append" in reader).toBe(false);
      expect("appendIfLastEventMatches" in reader).toBe(false);
      const readOnlyConnection = new DatabaseSync(path, { readOnly: true });
      try {
        expect(() => readOnlyConnection.prepare(
          "INSERT INTO events(event_id,ticket_id,event_json) VALUES ('forged','ticket','{}')",
        ).run()).toThrow();
      } finally {
        readOnlyConnection.close();
      }
    } finally {
      reader?.close();
      writer.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed if the database does not exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "foundry-readonly-missing-"));
    try {
      expect(() => new ReadOnlySQLiteJournal(join(dir, "missing.sqlite"))).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not prevent a separate process with filesystem write access from bypassing authorization", () => {
    const dir = mkdtempSync(join(tmpdir(), "foundry-readonly-boundary-"));
    const path = join(dir, "events.sqlite");
    const writer = new SQLiteJournal(path);
    let reader: ReadOnlySQLiteJournal | undefined;
    let attacker: DatabaseSync | undefined;
    try {
      writer.append("ticket", "TICKET_CREATED", "human:owner", { title: "Original" });
      reader = new ReadOnlySQLiteJournal(path);
      attacker = new DatabaseSync(path);
      attacker.prepare(
        "INSERT INTO events(event_id,ticket_id,event_json) VALUES (?,?,?)",
      ).run("forged", "ticket", JSON.stringify({
        event_id: "forged",
        ticket_id: "ticket",
        event_type: "MERGE_AUTHORIZED",
        actor: "human:forged",
        timestamp: new Date().toISOString(),
        payload: {},
      }));
      expect(reader.read("ticket").at(-1)?.event_type).toBe("MERGE_AUTHORIZED");
    } finally {
      attacker?.close();
      reader?.close();
      writer.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
