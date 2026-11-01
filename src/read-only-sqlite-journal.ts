import { DatabaseSync } from "node:sqlite";
import type { Event } from "./domain.ts";

/**
 * Read-only SQLite journal view for untrusted consumers.
 *
 * Does not create a database, schema, triggers or write transactions.
 * IMPORTANT: readOnly is a connection-level restriction, not an OS-level
 * isolation boundary. The process must also lack filesystem write access
 * to the authoritative database and its parent directory.
 */
export class ReadOnlySQLiteJournal {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path === ":memory:") {
      throw new Error("Read-only journal requires an existing database file");
    }
    this.db = new DatabaseSync(path, { readOnly: true });
  }

  read(ticket: string): Event[] {
    return (
      this.db
        .prepare(
          "SELECT event_json FROM events WHERE ticket_id=? ORDER BY sequence",
        )
        .all(ticket) as { event_json: string }[]
    ).map((row) => JSON.parse(row.event_json) as Event);
  }

  close(): void {
    this.db.close();
  }
}
