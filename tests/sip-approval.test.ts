import { describe, expect, it } from "vitest";

import { validateSipApprovalReceipt } from "../src/sip-approval.ts";
import type {
  SipApprovalReceipt,
  VerifiedHumanApproval,
  VerifiedSipContent,
} from "../src/sip-approval.ts";

const sip: VerifiedSipContent = {
  revision: "3",
  git_sha: "a".repeat(40),
  utf8_content: "approved SIP content",
};
const human: VerifiedHumanApproval = {
  approver_id: "github-user:123",
  source: "trusted-approval-adapter",
  source_event_id: "event-123",
  approved_at: "2026-10-30T12:00:00.000Z",
};
const receipt: SipApprovalReceipt = {
  sip_revision: "3",
  sip_git_sha: sip.git_sha,
  sip_sha256:
    "296990c2d458be7e5c3ab476d323ed68b95d60db4b1869b02f9d496d481ed0c2",
  ...human,
};

describe("SIP approval receipt", () => {
  it("accepts matching exact content and trusted approval event", () => {
    expect(() => validateSipApprovalReceipt(receipt, sip, human)).not.toThrow();
  });

  it("rejects a changed SIP even when the revision is unchanged", () => {
    expect(() =>
      validateSipApprovalReceipt(
        receipt,
        { ...sip, utf8_content: "changed" },
        human,
      ),
    ).toThrow("digest mismatch");
  });

  it("rejects a stale commit or a shortened digest", () => {
    expect(() =>
      validateSipApprovalReceipt(
        { ...receipt, sip_git_sha: "b".repeat(40) },
        sip,
        human,
      ),
    ).toThrow("Git SHA mismatch");
    expect(() =>
      validateSipApprovalReceipt(
        { ...receipt, sip_sha256: "a".repeat(12) },
        sip,
        human,
      ),
    ).toThrow("64-character");
  });

  it("rejects forged actor/provenance claims", () => {
    expect(() =>
      validateSipApprovalReceipt(
        { ...receipt, approver_id: "human:owner" },
        sip,
        human,
      ),
    ).toThrow("verified human event");
    expect(() =>
      validateSipApprovalReceipt(
        { ...receipt, source_event_id: "fabricated" },
        sip,
        human,
      ),
    ).toThrow("verified human event");
  });

  it("requires a valid UTC timestamp", () => {
    expect(() =>
      validateSipApprovalReceipt(
        { ...receipt, approved_at: "2026-10-30T12:00:00+01:00" },
        sip,
        { ...human, approved_at: "2026-10-30T12:00:00+01:00" },
      ),
    ).toThrow("UTC approval timestamp");
  });
});
