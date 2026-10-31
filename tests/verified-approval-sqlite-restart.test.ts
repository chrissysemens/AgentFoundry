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
    const holder: { journal?: SQLiteJournal } = {};
    const readCount = () => holder.journal?.read("ticket").length ?? 0;
    try {
      const first = new VerifiedApprovalWriter(
        (verify) => {
          holder.journal = new SQLiteJournal(path, verify);
          return holder.journal;
        },
        policy,
        unavailable,
        "ticket",
      );
      await first.append("ticket", "TICKET_CREATED", "human:owner", {
        title: "Persisted ticket",
      });
      holder.journal?.close();
      holder.journal = undefined;

      const reopened = new VerifiedApprovalWriter(
        (verify) => {
          holder.journal = new SQLiteJournal(path, verify);
          return holder.journal;
        },
        policy,
        unavailable,
        "ticket",
      );
      const state = await reopened.append(
        "ticket",
        "GRILL_STARTED",
        "agent:planner",
      );
      expect(state.title).toBe("Persisted ticket");
      expect(readCount()).toBe(2);
      await expect(
        reopened.append("ticket", "SIP_APPROVED", "human:owner", {
          receipt: { ...fixtureReceipt, source_event_id: "456" },
        }),
      ).rejects.toThrow("Independent evidence unavailable");
      expect(readCount()).toBe(2);
    } finally {
      holder.journal?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
