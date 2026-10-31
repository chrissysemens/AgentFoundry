import { describe, expect, it } from "vitest";
import type { State } from "../src/domain.ts";
import {
  validateMergeAuthorization,
} from "../src/merge-authorization.ts";

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

describe("separate merge authorization gate", () => {
  it("accepts matching independently verified human evidence", () => {
    expect(() => validateMergeAuthorization(state, evidence, [123])).not.toThrow();
  });

  it("fails closed without evidence or with an unauthorized human", () => {
    expect(() => validateMergeAuthorization(state, undefined, [123])).toThrow();
    expect(() => validateMergeAuthorization(state, evidence, [456])).toThrow();
  });

  it("rejects stale commit, review, ticket, and nonaccepted state", () => {
    for (const changed of [
      { code_revision: "b".repeat(40) },
      { review_id: "oracle-old" },
      { ticket_id: "OTHER" },
    ]) {
      expect(() =>
        validateMergeAuthorization(state, { ...evidence, ...changed }, [123]),
      ).toThrow();
    }
    expect(() =>
      validateMergeAuthorization({ ...state, status: "REWORK" }, evidence, [123]),
    ).toThrow();
  });
});
