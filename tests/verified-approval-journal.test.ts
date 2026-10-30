import { describe, expect, it } from "vitest";

import { replayWithVerifiedGitHubApprovals } from "../src/verified-approval-journal.ts";
import type { Event } from "../src/domain.ts";
import type { TrustedGitHubApprovalGateway } from "../src/github-approval-resolver.ts";
import { fixtureReceipt } from "./approval-fixture.ts";

const policy = {
  repository: "owner/repo",
  issue_number: 1,
  allowed_human_ids: [123],
};

const gateway: TrustedGitHubApprovalGateway = {
  async fetchComment() {
    throw new Error("GitHub evidence unavailable");
  },
  async fetchSipAtCommit() {
    throw new Error("SIP unavailable");
  },
  async verifyAttestation() {
    return undefined;
  },
};

describe("verified approval journal replay", () => {
  it("rejects historical approval without authenticated GitHub evidence", async () => {
    const events: Event[] = [
      {
        event_id: "one",
        ticket_id: "ticket",
        event_type: "SIP_APPROVED",
        actor: "human:owner",
        timestamp: "2026-10-30T00:00:00.000Z",
        payload: { receipt: fixtureReceipt },
      },
    ];
    await expect(
      replayWithVerifiedGitHubApprovals("ticket", events, policy, gateway),
    ).rejects.toThrow("Numeric GitHub comment ID required");
    expect(events[0]?.payload.receipt).toEqual(fixtureReceipt);
  });

  it("replays ordinary events without approval evidence", async () => {
    const events: Event[] = [
      {
        event_id: "one",
        ticket_id: "ticket",
        event_type: "TICKET_CREATED",
        actor: "human:owner",
        timestamp: "2026-10-30T00:00:00.000Z",
        payload: { title: "Safe ticket" },
      },
    ];
    const state = await replayWithVerifiedGitHubApprovals(
      "ticket",
      events,
      policy,
      gateway,
    );
    expect(state.title).toBe("Safe ticket");
  });
});
