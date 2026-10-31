import { describe, expect, it } from "vitest";
import {
  matchGitHubApprovalEvidence,
  validateApprovalCaptureSource,
  type ApprovalAttestation,
  type GitHubApprovalEvent,
  type GitHubApprovalPolicy,
} from "../src/github-approval-evidence.ts";
import type { SipApprovalReceipt } from "../src/sip-approval.ts";

const sha = "a".repeat(40);
const digest = "b".repeat(64);
const time = "2026-10-30T00:00:00.000Z";
const receipt: SipApprovalReceipt = {
  sip_revision: "3",
  sip_git_sha: sha,
  sip_sha256: digest,
  approver_id: "123",
  approved_at: time,
  source: "github-issue-comment",
  source_event_id: "456",
};
const event: GitHubApprovalEvent = {
  repository: "owner/repo",
  issue_number: 1,
  comment_id: 456,
  author_id: 123,
  author_type: "User",
  created_at: time,
  updated_at: time,
  body: `Approved SIP 3 at ${sha} with SHA-256 ${digest}`,
};
const attestation: ApprovalAttestation = {
  repository: "owner/repo",
  issue_number: 1,
  comment_id: 456,
  author_id: 123,
  sip_revision: "3",
  sip_git_sha: sha,
  sip_sha256: digest,
  approved_at: time,
};
const policy: GitHubApprovalPolicy = {
  repository: "owner/repo",
  issue_number: 1,
  allowed_human_ids: [123],
};

describe("GitHub approval evidence matching", () => {
  it("matches a trusted, independently attested approval", () => {
    expect(
      matchGitHubApprovalEvidence(receipt, event, attestation, policy),
    ).toEqual({
      approver_id: "123",
      source_event_id: "456",
      source: "github-issue-comment",
      approved_at: time,
    });
  });
  it("fails without immutable evidence", () => {
    expect(() =>
      matchGitHubApprovalEvidence(receipt, event, undefined, policy),
    ).toThrow("Immutable approval attestation required");
  });
  it("rejects wrong repository and issue", () => {
    expect(() =>
      matchGitHubApprovalEvidence(receipt, event, attestation, {
        ...policy,
        repository: "other/repo",
      }),
    ).toThrow("repository or issue mismatch");
    expect(() =>
      matchGitHubApprovalEvidence(receipt, event, attestation, {
        ...policy,
        issue_number: 2,
      }),
    ).toThrow("repository or issue mismatch");
  });
  it("rejects spoofed and bot identities", () => {
    expect(() =>
      matchGitHubApprovalEvidence(
        receipt,
        {
          ...event,
          author_id: 999,
        },
        attestation,
        policy,
      ),
    ).toThrow("Unauthorized GitHub approval author");
    expect(() =>
      matchGitHubApprovalEvidence(
        receipt,
        {
          ...event,
          author_type: "Bot",
        },
        attestation,
        policy,
      ),
    ).toThrow("Unauthorized GitHub approval author");
  });
  it("rejects edited comments and changed SIP identity", () => {
    expect(() =>
      matchGitHubApprovalEvidence(
        receipt,
        {
          ...event,
          updated_at: "2026-10-30T01:00:00.000Z",
        },
        attestation,
        policy,
      ),
    ).toThrow("comment edit mismatch");
    expect(() =>
      matchGitHubApprovalEvidence(
        {
          ...receipt,
          sip_git_sha: "c".repeat(40),
        },
        event,
        attestation,
        policy,
      ),
    ).toThrow("Attested SIP identity mismatch");
  });
  it("rejects missing explicit approval identity in the comment", () => {
    expect(() =>
      matchGitHubApprovalEvidence(
        receipt,
        {
          ...event,
          body: "looks good",
        },
        attestation,
        policy,
      ),
    ).toThrow("explicitly bind");
  });
});

describe("approval capture source validation", () => {
  it("accepts independently authenticated matching source metadata", () => {
    expect(() =>
      validateApprovalCaptureSource(event, attestation, policy),
    ).not.toThrow();
  });

  it("rejects edited comments and unauthorized actors before signing", () => {
    expect(() =>
      validateApprovalCaptureSource(
        { ...event, updated_at: "2026-10-31T00:00:00.000Z" },
        attestation,
        policy,
      ),
    ).toThrow("Approval capture source is not trusted");
    expect(() =>
      validateApprovalCaptureSource(
        { ...event, author_id: 999 },
        attestation,
        policy,
      ),
    ).toThrow("Approval capture source is not trusted");
  });

  it("rejects a mismatched SIP commit or digest", () => {
    expect(() =>
      validateApprovalCaptureSource(
        event,
        { ...attestation, sip_git_sha: "c".repeat(40) },
        policy,
      ),
    ).toThrow("Approval capture source is not trusted");
  });
});
