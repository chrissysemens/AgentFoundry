import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { reduceEvents } from "./domain.ts";
import type { ApprovalEvidenceVerifier } from "./domain.ts";
import type { Event, Payload, State } from "./domain.ts";

export function makeEvent(
  ticket_id: string,
  event_type: string,
  actor: string,
  payload: Payload = {},
): Event {
  return {
    event_id: randomUUID(),
    ticket_id,
    event_type,
    actor,
    timestamp: new Date().toISOString(),
    payload,
  };
}

export interface Journal {
  read(ticket: string): Event[];
  append(ticket: string, type: string, actor: string, payload?: Payload): State;
}

export class MemoryJournal implements Journal {
  constructor(private readonly verifyApproval?: ApprovalEvidenceVerifier) {}
  private events = new Map<string, Event[]>();

  read(ticket: string): Event[] {
    return structuredClone(this.events.get(ticket) ?? []);
  }

  append(
    ticket: string,
    type: string,
    actor: string,
    payload: Payload = {},
  ): State {
    if (type === "MERGE_AUTHORIZED") {
      throw new Error("Merge authorization requires verified atomic writer");
    }
    const e = makeEvent(ticket, type, actor, payload);
    const events = [...this.read(ticket), e];
    const s = reduceEvents(ticket, events, this.verifyApproval);
    this.events.set(ticket, events);

    return s;
  }
}

export class SQLiteJournal implements Journal {
  private db: DatabaseSync;

  constructor(
    path: string,
    private readonly verifyApproval?: ApprovalEvidenceVerifier,
    private readonly allowPrivilegedMergeWrites = false,
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        ticket_id TEXT NOT NULL,
        event_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS events_ticket
        ON events(ticket_id, sequence);

      CREATE TRIGGER IF NOT EXISTS events_no_update
        BEFORE UPDATE ON events
        BEGIN SELECT RAISE(ABORT, 'append only'); END;

      CREATE TRIGGER IF NOT EXISTS events_no_delete
        BEFORE DELETE ON events
        BEGIN SELECT RAISE(ABORT, 'append only'); END;`,
    );
  }

  read(ticket: string): Event[] {
    return (
      this.db
        .prepare(
          "SELECT event_json FROM events WHERE ticket_id=? ORDER BY sequence",
        )
        .all(ticket) as { event_json: string }[]
    ).map((r) => JSON.parse(r.event_json) as Event);
  }

  append(
    ticket: string,
    type: string,
    actor: string,
    payload: Payload = {},
  ): State {
    if (type === "MERGE_AUTHORIZED") {
      throw new Error("Merge authorization requires verified atomic writer");
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const e = makeEvent(ticket, type, actor, payload);
      const state = reduceEvents(
        ticket,
        [...this.read(ticket), e],
        this.verifyApproval,
      );
      this.db
        .prepare(
          "INSERT INTO events(event_id,ticket_id,event_json) VALUES (?,?,?)",
        )
        .run(e.event_id, ticket, JSON.stringify(e));
      this.db.exec("COMMIT");

      return state;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * Compare the last observed journal event inside the same SQLite write
   * transaction that commits the authorization. A competing connection cannot
   * change the journal between this check and the insert.
   *
   * The caller must independently authenticate the decision and replay state
   * before calling. This is a stale-state guard, not evidence authentication.
   */
  appendIfLastEventMatches(
    ticket: string,
    expectedEventId: string,
    type: string,
    actor: string,
    payload: Payload = {},
  ): State {
    if (!this.allowPrivilegedMergeWrites) {
      throw new Error("Privileged merge writes disabled for this journal");
    }
    if (type !== "MERGE_AUTHORIZED") {
      throw new Error("Conditional append only accepts merge authorization");
    }
    if (!expectedEventId) throw new Error("Expected event ID required");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const history = this.read(ticket);
      if (history.at(-1)?.event_id !== expectedEventId) {
        throw new Error("Journal changed since authorization verification");
      }
      const event = makeEvent(ticket, type, actor, payload);
      const state = reduceEvents(
        ticket,
        [...history, event],
        this.verifyApproval,
      );
      this.db
        .prepare(
          "INSERT INTO events(event_id,ticket_id,event_json) VALUES (?,?,?)",
        )
        .run(event.event_id, ticket, JSON.stringify(event));
      this.db.exec("COMMIT");
      return state;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
