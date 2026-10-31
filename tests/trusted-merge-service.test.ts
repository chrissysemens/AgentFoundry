import { describe, expect, it, vi } from "vitest";
import type { State } from "../src/domain.ts";
import type { Journal } from "../src/journal.ts";
import {
  TrustedMergeService,
  createSignedGitHubTrustedMergeService,
} from "../src/trusted-merge-service.ts";

const ticket = "FOUND-002";
const revision = "a".repeat(40);
const payload = {
  implementation_id: "impl-1",
  code_revision: revision,
  review_id: "review-1",
};
const evidence = {
  ticket_id: ticket,
  ...payload,
  human_id: 123,
  authorized_at: "2026-10-31T12:00:00.000Z",
};
const state = {
  ticket_id: ticket,
  status: "ACCEPTED",
  implementation_id: payload.implementation_id,
  accepted_revision: revision,
  last_review_id: payload.review_id,
  history: [{ event_id: "snapshot-1" }],
} as State;

describe("trusted merge service facade", () => {
  it("rejects inconsistent merge and SIP repository bindings", () => {
    const journal = { read: vi.fn(() => []) } as unknown as Journal;
    expect(() =>
      createSignedGitHubTrustedMergeService(
        journal,
        ticket,
        [123],
        async () => ({}),
        { get: async () => undefined },
        { trusted_keys: {} },
        "owner/repo",
        1,
        2,
        { repository: "other/repo", issue_number: 1, allowed_human_ids: [123] },
        {
          fetchComment: async () => { throw new Error("unused"); },
          fetchSipAtCommit: async () => { throw new Error("unused"); },
          verifyAttestation: async () => undefined,
        },
      ),
    ).toThrow("Merge and SIP approval repository bindings differ");
  });
  it("requires independent evidence before conditional append", async () => {
    const conditional = vi.fn(() => ({ ...state, status: "MERGE_AUTHORIZED" }));
    const journal = {
      appendIfLastEventMatches: conditional,
      read: vi.fn(() => []),
    } as unknown as Journal;
    const resolve = vi.fn(async () => evidence);
    const verifiedState = vi.fn(async () => state);
    const service = new TrustedMergeService(
      journal,
      ticket,
      [123],
      resolve,
      verifiedState,
    );

    expect("appendIfLastEventMatches" in service).toBe(false);
    await expect(
      service.authorizeMerge(ticket, "human:999", payload),
    ).rejects.toThrow("Merge actor does not match verified human");
    expect(conditional).not.toHaveBeenCalled();

    await service.authorizeMerge(ticket, "human:123", payload);
    expect(resolve).toHaveBeenCalledWith(ticket);
    expect(verifiedState).toHaveBeenCalledWith(ticket);
    expect(conditional).toHaveBeenCalledWith(
      ticket,
      "snapshot-1",
      "MERGE_AUTHORIZED",
      "human:123",
      payload,
    );
  });

  it("fails closed when trusted evidence cannot be resolved", async () => {
    const conditional = vi.fn();
    const journal = {
      appendIfLastEventMatches: conditional,
      read: vi.fn(() => []),
    } as unknown as Journal;
    const service = new TrustedMergeService(
      journal,
      ticket,
      [123],
      async () => undefined,
      async () => state,
    );
    await expect(
      service.authorizeMerge(ticket, "human:123", payload),
    ).rejects.toThrow("Trusted human merge authorization unavailable");
    expect(conditional).not.toHaveBeenCalled();
  });
});
