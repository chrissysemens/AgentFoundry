import { describe, expect, it } from "vitest";

import { MemoryJournal } from "../src/journal.ts";
import { VerifiedApprovalWriter } from "../src/verified-approval-writer.ts";
import type { TrustedGitHubApprovalGateway } from "../src/github-approval-resolver.ts";
import { fixtureReceipt } from "./approval-fixture.ts";

const policy = {
  repository: "owner/repo",
  issue_number: 1,
  allowed_human_ids: [123],
};

const gateway: TrustedGitHubApprovalGateway = {
  async fetchComment() {
    throw new Error("Independent GitHub evidence unavailable");
  },
  async fetchSipAtCommit() {
    throw new Error("SIP unavailable");
  },
  async verifyAttestation() {
    return undefined;
  },
};

describe("verified approval writer", () => {
  it("rejects unauthenticated approval without recording it", async () => {
    let journal: MemoryJournal | undefined;
    const writer = new VerifiedApprovalWriter(
      (verify) => {
        journal = new MemoryJournal(verify);
        return journal;
      },
      policy,
      gateway,
      "ticket",
    );
    await writer.append("ticket", "TICKET_CREATED", "human:owner", {
      title: "Test",
    });
    await writer.append("ticket", "GRILL_STARTED", "agent:planner");
    await writer.append("ticket", "SIP_PROPOSED", "agent:planner", {
      revision: "2",
      sha256: fixtureReceipt.sip_sha256,
    });
    await expect(
      writer.append("ticket", "SIP_APPROVED", "human:owner", {
        revision: "2",
        sha256: fixtureReceipt.sip_sha256,
        receipt: fixtureReceipt,
      }),
    ).rejects.toThrow("Numeric GitHub comment ID required");
    expect(journal?.read("ticket")).toHaveLength(3);
  });

  it("does not accept approval with a missing receipt", async () => {
    const writer = new VerifiedApprovalWriter(
      (verify) => new MemoryJournal(verify),
      policy,
      gateway,
      "ticket",
    );
    await expect(
      writer.append("ticket", "SIP_APPROVED", "human:owner"),
    ).rejects.toThrow("Approval receipt required");
  });
});
