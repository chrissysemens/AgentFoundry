import { describe, expect, it, vi } from "vitest";
import type { State } from "../src/domain.ts";
import type { Journal } from "../src/journal.ts";
import { VerifiedMergeAuthorizationWriter } from "../src/verified-merge-writer.ts";

const ticket = "FOUND-002";
const revision = "a".repeat(40);
const state = {
  ticket_id: ticket,
  status: "ACCEPTED",
  implementation_id: "impl-1",
  accepted_revision: revision,
  last_review_id: "review-1",
} as State;
const evidence = {
  ticket_id: ticket,
  implementation_id: "impl-1",
  code_revision: revision,
  review_id: "review-1",
  human_id: 123,
  authorized_at: "2026-10-31T12:00:00.000Z",
};
const payload = {
  implementation_id: "impl-1",
  code_revision: revision,
  review_id: "review-1",
};

function setup(
  decision: typeof evidence | undefined,
  current: State = state,
) {
  const append = vi.fn(() => ({ ...current, status: "MERGE_AUTHORIZED" }));
  const journal = { append, read: vi.fn(() => []) } as unknown as Journal;
  const resolve = vi.fn(async () => decision);
  const verifiedState = vi.fn(async () => current);
  const writer = new VerifiedMergeAuthorizationWriter(
    journal,
    ticket,
    [123],
    resolve,
    verifiedState,
  );
  return { writer, append, resolve, verifiedState };
}

describe("verified merge journal boundary", () => {
  it("writes only after independent evidence and verified replay", async () => {
    const { writer, append, resolve, verifiedState } = setup(evidence);
    await writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload);
    expect(verifiedState).toHaveBeenCalledWith(ticket);
    expect(resolve).toHaveBeenCalledWith(ticket);
    expect(append).toHaveBeenCalledOnce();
  });

  it("rejects stale evidence, actor mismatch and payload tampering", async () => {
    const cases = [
      { decision: { ...evidence, review_id: "stale" } },
      { actor: "human:456" },
      { body: { ...payload, code_revision: "b".repeat(40) } },
      { current: { ...state, status: "REWORK" } },
    ];
    for (const scenario of cases) {
      const { writer, append } = setup(scenario.decision ?? evidence, scenario.current);
      await expect(
        writer.append(
          ticket,
          "MERGE_AUTHORIZED",
          scenario.actor ?? "human:123",
          scenario.body ?? payload,
        ),
      ).rejects.toThrow();
      expect(append).not.toHaveBeenCalled();
    }
  });

  it("rejects missing evidence and cross-ticket writes", async () => {
    const { writer, append } = setup(undefined);
    await expect(
      writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload),
    ).rejects.toThrow();
    await expect(
      writer.append("OTHER", "MERGE_AUTHORIZED", "human:123", payload),
    ).rejects.toThrow();
    expect(append).not.toHaveBeenCalled();
  });

  it("does not append when independent verification fails", async () => {
    const { writer, append, verifiedState } = setup();
    verifiedState.mockRejectedValueOnce(new Error("Untrusted SIP history"));
    await expect(
      writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload),
    ).rejects.toThrow("Untrusted SIP history");
    expect(append).not.toHaveBeenCalled();
  });
});
