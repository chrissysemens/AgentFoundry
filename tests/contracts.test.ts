import { describe, expect, it } from "vitest";

import { validateReviewContract } from "../src/contracts.ts";

const validReview = {
  schema_version: "1",
  review_id: "review-1",
  implementation_id: "impl-1",
  sip_revision: "2",
  sip_sha256: "hash",
  code_revision: "code-1",
  reviewer: "oracle:independent",
  scope: "INITIAL_FULL",
  verdict: "REJECT",
  timestamp: "2026-10-18T00:00:00.000Z",
  automated_check_refs: ["npm-run-verify:fixture"],
  checks_passed: false,
  findings: [
    {
      id: "finding-1",
      category: "standard",
      severity: "high",
      location: "src/domain.ts:1",
      evidence: "Evidence for the finding",
      resolution: "Correct the issue",
      rule_ref: "STD-001",
    },
  ],
};

describe("versioned Oracle JSON Schema contracts", () => {
  it("accepts a valid v1 review and evidenced mandatory finding", () => {
    expect(() => validateReviewContract(validReview)).not.toThrow();
  });

  it("rejects an incompatible schema version", () => {
    expect(() =>
      validateReviewContract({ ...validReview, schema_version: "2" }),
    ).toThrow();
  });

  it("rejects a missing schema version", () => {
    const { schema_version: _version, ...review } = validReview;

    expect(() => validateReviewContract(review)).toThrow();
  });

  it("rejects an invalid verdict", () => {
    expect(() =>
      validateReviewContract({ ...validReview, verdict: "MAYBE" }),
    ).toThrow();
  });

  it("rejects missing evidence", () => {
    const findings = [{ ...validReview.findings[0], evidence: "" }];

    expect(() =>
      validateReviewContract({ ...validReview, findings }),
    ).toThrow();
  });

  it("rejects a mandatory finding without a rule reference", () => {
    const findings = [{ ...validReview.findings[0], rule_ref: undefined }];

    expect(() =>
      validateReviewContract({ ...validReview, findings }),
    ).toThrow();
  });

  it("rejects an inconclusive verdict without an escalation reason", () => {
    expect(() =>
      validateReviewContract({
        ...validReview,
        verdict: "INCONCLUSIVE",
        findings: [],
      }),
    ).toThrow();
  });

  it("requires regression evidence for incremental reviews", () => {
    expect(() =>
      validateReviewContract({ ...validReview, scope: "INCREMENTAL" }),
    ).toThrow();
  });
});

describe("Oracle verdict and check-reference invariants", () => {
  it("rejects REJECT with no findings", () => {
    expect(() =>
      validateReviewContract({ ...validReview, findings: [] }),
    ).toThrow();
  });

  it("rejects REJECT with advisory-only findings", () => {
    const findings = [
      { ...validReview.findings[0], category: "advisory", rule_ref: undefined },
    ];
    expect(() =>
      validateReviewContract({ ...validReview, findings }),
    ).toThrow();
  });

  it("rejects ACCEPT with failed checks", () => {
    expect(() =>
      validateReviewContract({
        ...validReview,
        verdict: "ACCEPT",
        findings: [],
      }),
    ).toThrow();
  });

  it("rejects ACCEPT with mandatory findings", () => {
    expect(() =>
      validateReviewContract({
        ...validReview,
        verdict: "ACCEPT",
        checks_passed: true,
      }),
    ).toThrow();
  });

  it("accepts ACCEPT with passing checks and no blocking findings", () => {
    expect(() =>
      validateReviewContract({
        ...validReview,
        verdict: "ACCEPT",
        checks_passed: true,
        findings: [],
      }),
    ).not.toThrow();
  });

  it("requires automated check references for every review scope", () => {
    const { automated_check_refs: _refs, ...missing } = validReview;
    expect(() => validateReviewContract(missing)).toThrow();
    expect(() =>
      validateReviewContract({ ...validReview, automated_check_refs: [] }),
    ).toThrow();
    expect(() =>
      validateReviewContract({ ...validReview, automated_check_refs: [""] }),
    ).toThrow();
    expect(() =>
      validateReviewContract({
        ...validReview,
        automated_check_refs: ["check:a", "check:a"],
      }),
    ).toThrow();
  });

  it("retains automated check references for a full review", () => {
    expect(() =>
      validateReviewContract({
        ...validReview,
        scope: "INITIAL_FULL",
        automated_check_refs: ["ci:run-123", "smoke:run-123"],
      }),
    ).not.toThrow();
  });
});
