import { describe, expect, it } from "vitest";
import type { State } from "../src/domain.ts";
import { validateMergeAuthorization } from "../src/merge-authorization.ts";

const state = {
  ticket_id: "FOUND-002",
  status: "ACCEPTED",
  implementation_id: "impl-1",
  accepted_revision: "a".repeat(40),
  last_review_id: "oracle-1",
} as State;
const evidence = {
  ticket_id: "FOUND-002",
  implementation_id: "impl-1",
  code_revision: "a".repeat(40),
  review_id: "oracle-1",
  human_id: 123,
  authorized_at: "2026-10-31T12:00:00.000Z",
};

const check = (
  current: State = state,
  approval: typeof evidence | undefined,
  humans: number[] = [123],
) => validateMergeAuthorization(current, approval, humans);

describe("separate merge authorization gate", () => {
  it("accepts matching independently verified human evidence", () => {
    expect(() => check(state, evidence)).not.toThrow();
  });

  it("fails closed without evidence or with an unauthorized human", () => {
    expect(() => check(state, undefined)).toThrow();
    expect(() => check(state, evidence, [456])).toThrow();
  });

  it("rejects malformed commit IDs and empty review identities", () => {
    for (const changed of [
      { code_revision: "not-a-full-sha" },
      { code_revision: "A".repeat(40) },
      { implementation_id: "" },
      { review_id: "" },
      { human_id: 0 },
      { authorized_at: "not-a-timestamp" },
    ]) {
      expect(() => check(state, { ...evidence, ...changed })).toThrow();
    }
    const malformedState = {
      ...state,
      accepted_revision: "not-a-full-sha",
    };
    expect(() =>
      check(malformedState, {
        ...evidence,
        code_revision: "not-a-full-sha",
      }),
    ).toThrow();
  });

  it("rejects stale commit, review, ticket, and nonaccepted state", () => {
    for (const changed of [
      { code_revision: "b".repeat(40) },
      { review_id: "oracle-old" },
      { ticket_id: "OTHER" },
    ]) {
      expect(() => check(state, { ...evidence, ...changed })).toThrow();
    }
    expect(() => check({ ...state, status: "REWORK" }, evidence)).toThrow();
  });
});
