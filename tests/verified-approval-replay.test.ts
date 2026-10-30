import { describe, expect, it } from "vitest";

import { prepareVerifiedApprovalVerifier } from "../src/verified-approval-replay.ts";
import type { Event } from "../src/domain.ts";
import type { TrustedGitHubApprovalGateway } from "../src/github-approval-resolver.ts";
import { fixtureReceipt } from "./approval-fixture.ts";

const policy = {
  repository: "owner/repo",
  issue_number: 1,
  allowed_human_ids: [123],
};

const unavailable: TrustedGitHubApprovalGateway = {
  async fetchComment() {
    throw new Error("GitHub unavailable");
  },
  async fetchSipAtCommit() {
    throw new Error("GitHub unavailable");
  },
  async verifyAttestation() {
    return undefined;
  },
};

function event(receipt: unknown): Event {
  return {
    event_id: "event-1",
    ticket_id: "ticket-1",
    event_type: "SIP_APPROVED",
    actor: "human:owner",
    timestamp: "2026-10-30T00:00:00.000Z",
    payload: { receipt },
  };
}

describe("verified approval replay", () => {
  it("does not authorize a receipt absent from preverified history", async () => {
    const verify = await prepareVerifiedApprovalVerifier(
      [],
      policy,
      unavailable,
    );
    expect(verify(fixtureReceipt)).toBeUndefined();
  });

  it("rejects malformed historical approval receipts", async () => {
    await expect(
      prepareVerifiedApprovalVerifier([event(null)], policy, unavailable),
    ).rejects.toThrow("Approval receipt required");
  });

  it("fails closed when historical approval cannot be authenticated", async () => {
    await expect(
      prepareVerifiedApprovalVerifier(
        [event(fixtureReceipt)],
        policy,
        unavailable,
      ),
    ).rejects.toThrow("Numeric GitHub comment ID required");
  });
});
