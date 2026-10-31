import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SQLiteJournal, makeEvent } from "../src/journal.ts";
import { VerifiedApprovalWriter } from "../src/verified-approval-writer.ts";
import type { TrustedGitHubApprovalGateway } from "../src/github-approval-resolver.ts";
import { fixtureReceipt } from "./approval-fixture.ts";

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
        external
          ?.prepare("UPDATE events SET event_json=? WHERE ticket_id=?")
          .run('{"forged":true}', "ticket"),
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

  it("fails closed when a separate connection inserts an unverified historical approval", async () => {
    const directory = mkdtempSync(join(tmpdir(), "foundry-insert-"));
    const path = join(directory, "events.sqlite");
    const holder: { journal?: SQLiteJournal } = {};
    let external: DatabaseSync | undefined;
    const gateway: TrustedGitHubApprovalGateway = {
      async fetchComment() {
        throw new Error("Independent evidence unavailable");
      },
      async fetchSipAtCommit() {
        throw new Error("SIP unavailable");
      },
      async verifyAttestation() {
        return undefined;
      },
    };
    const count = () => holder.journal?.read("ticket").length ?? 0;
    try {
      const writer = new VerifiedApprovalWriter(
        (verify) => {
          holder.journal = new SQLiteJournal(path, verify);
          return holder.journal;
        },
        {
          repository: "owner/repo",
          issue_number: 1,
          allowed_human_ids: [123],
        },
        gateway,
        "ticket",
      );
      await writer.append("ticket", "TICKET_CREATED", "human:owner", {
        title: "Direct insert",
      });
      external = new DatabaseSync(path);
      const forged = makeEvent("ticket", "SIP_APPROVED", "human:owner", {
        receipt: { ...fixtureReceipt, source_event_id: "123" },
      });
      external
        .prepare(
          "INSERT INTO events(event_id,ticket_id,event_json) VALUES (?,?,?)",
        )
        .run(forged.event_id, "ticket", JSON.stringify(forged));
      expect(count()).toBe(2);
      await expect(
        writer.append("ticket", "GRILL_STARTED", "agent:planner"),
      ).rejects.toThrow("Independent evidence unavailable");
      expect(count()).toBe(2);
    } finally {
      external?.close();
      holder.journal?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("serializes conflicting appends across independent SQLite connections", () => {
    const directory = mkdtempSync(join(tmpdir(), "foundry-writers-"));
    const path = join(directory, "events.sqlite");
    const first = new SQLiteJournal(path);
    const second = new SQLiteJournal(path);
    try {
      first.append("ticket", "TICKET_CREATED", "human:owner", {
        title: "Original",
      });
      expect(() =>
        second.append("ticket", "TICKET_CREATED", "human:owner", {
          title: "Conflicting",
        }),
      ).toThrow("Already created");
      expect(first.read("ticket")).toHaveLength(1);
      expect(second.read("ticket")).toHaveLength(1);
    } finally {
      second.close();
      first.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("fails closed when another connection holds the write transaction", () => {
    const directory = mkdtempSync(join(tmpdir(), "foundry-lock-"));
    const path = join(directory, "events.sqlite");
    const journal = new SQLiteJournal(path);
    const external = new DatabaseSync(path);
    try {
      external.exec("BEGIN IMMEDIATE");
      expect(() =>
        journal.append("ticket", "TICKET_CREATED", "human:owner", {
          title: "Blocked",
        }),
      ).toThrow();
      expect(journal.read("ticket")).toHaveLength(0);
      external.exec("ROLLBACK");
      journal.append("ticket", "TICKET_CREATED", "human:owner", {
        title: "After rollback",
      });
      expect(journal.read("ticket")).toHaveLength(1);
    } finally {
      external.close();
      journal.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("rejects a stale merge authorization snapshot across connections", () => {
    const directory = mkdtempSync(join(tmpdir(), "foundry-cas-"));
    const path = join(directory, "events.sqlite");
    const first = new SQLiteJournal(path);
    const second = new SQLiteJournal(path);
    try {
      first.append("ticket", "TICKET_CREATED", "human:owner", {
        title: "Original",
      });
      const observed = first.read("ticket").at(-1)?.event_id;
      if (!observed) throw new Error("Missing observed event");
      second.append("ticket", "GRILL_STARTED", "agent:planner");
      expect(() =>
        first.appendIfLastEventMatches(
          "ticket",
          observed,
          "MERGE_AUTHORIZED",
          "human:123",
        ),
      ).toThrow("Journal changed since authorization verification");
      expect(first.read("ticket")).toHaveLength(2);
    } finally {
      second.close();
      first.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
