import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SQLiteJournal } from "../src/journal.ts";
import { VerifiedApprovalWriter } from "../src/verified-approval-writer.ts";
import type { TrustedGitHubApprovalGateway } from "../src/github-approval-resolver.ts";
import { fixtureReceipt } from "./approval-fixture.ts";

const policy = {
  repository: "owner/repo",
  issue_number: 1,
  allowed_human_ids: [123],
};

const unavailable: TrustedGitHubApprovalGateway = {
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

describe("verified SQLite journal restart", () => {
  it("preserves ordinary events and refuses unauthenticated approvals after reopening", async () => {
    const directory = mkdtempSync(join(tmpdir(), "foundry-verified-"));
    const path = join(directory, "journal.sqlite");
    let journal: SQLiteJournal | undefined;
    try {
      const first = new VerifiedApprovalWriter(
        (verify) => {
          journal = new SQLiteJournal(path, verify);
          return journal;
        },
        policy,
        unavailable,
      );
      await first.append("ticket", "TICKET_CREATED", "human:owner", {
        title: "Persisted ticket",
      });
      journal?.close();
      journal = undefined;

      const reopened = new VerifiedApprovalWriter(
        (verify) => {
          journal = new SQLiteJournal(path, verify);
          return journal;
        },
        policy,
        unavailable,
      );
      const state = await reopened.append(
        "ticket",
        "GRILL_STARTED",
        "agent:planner",
      );
      expect(state.title).toBe("Persisted ticket");
      expect(journal?.read("ticket")).toHaveLength(2);
      await expect(
        reopened.append("ticket", "SIP_APPROVED", "human:owner", {
          receipt: { ...fixtureReceipt, source_event_id: "456" },
        }),
      ).rejects.toThrow("Independent evidence unavailable");
      expect(journal?.read("ticket")).toHaveLength(2);
    } finally {
      journal?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
