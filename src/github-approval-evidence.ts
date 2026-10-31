import type {
  SipApprovalReceipt,
  VerifiedHumanApproval,
} from "./sip-approval.ts";

/** Identity and source metadata resolved by a trusted GitHub API client. */
export type GitHubApprovalEvent = {
  repository: string;
  issue_number: number;
  comment_id: number;
  author_id: number;
  author_type: string;
  created_at: string;
  updated_at: string;
  body: string;
};

/** Independent immutable evidence is required: GitHub comments are editable. */
export type ApprovalAttestation = {
  repository: string;
  issue_number: number;
  comment_id: number;
  author_id: number;
  sip_revision: string;
  sip_git_sha: string;
  sip_sha256: string;
  approved_at: string;
};

export type GitHubApprovalPolicy = {
  repository: string;
  issue_number: number;
  allowed_human_ids: readonly number[];
};

/**
 * This checks independently resolved facts, NOT their authenticity.
 * The caller MUST authenticate GitHub API responses and independently verify
 * the immutable attestation before invoking this function.
 */
export function matchGitHubApprovalEvidence(
  receipt: SipApprovalReceipt,
  event: GitHubApprovalEvent,
  attestation: ApprovalAttestation | undefined,
  policy: GitHubApprovalPolicy,
): VerifiedHumanApproval {
  if (!attestation) throw new Error("Immutable approval attestation required");
  if (
    event.repository !== policy.repository ||
    attestation.repository !== policy.repository ||
    event.issue_number !== policy.issue_number ||
    attestation.issue_number !== policy.issue_number
  ) {
    throw new Error("Approval repository or issue mismatch");
  }
  if (
    !Number.isSafeInteger(event.comment_id) ||
    event.comment_id <= 0 ||
    event.comment_id !== attestation.comment_id ||
    receipt.source_event_id !== String(event.comment_id)
  ) {
    throw new Error("Approval comment identity mismatch");
  }
  if (
    !Number.isSafeInteger(event.author_id) ||
    event.author_id <= 0 ||
    event.author_id !== attestation.author_id ||
    !policy.allowed_human_ids.includes(event.author_id) ||
    event.author_type !== "User" ||
    receipt.approver_id !== String(event.author_id) ||
    receipt.source !== "github-issue-comment"
  ) {
    throw new Error("Unauthorized GitHub approval author");
  }
  if (
    event.created_at !== attestation.approved_at ||
    receipt.approved_at !== attestation.approved_at ||
    event.updated_at !== event.created_at
  ) {
    throw new Error("Approval timestamp or comment edit mismatch");
  }
  if (
    receipt.sip_revision !== attestation.sip_revision ||
    receipt.sip_git_sha !== attestation.sip_git_sha ||
    receipt.sip_sha256 !== attestation.sip_sha256
  ) {
    throw new Error("Attested SIP identity mismatch");
  }
  if (
    !event.body.includes(receipt.sip_revision) ||
    !event.body.includes(receipt.sip_git_sha) ||
    !event.body.includes(receipt.sip_sha256)
  ) {
    throw new Error("Comment does not explicitly bind the approved SIP");
  }
  return {
    approver_id: String(event.author_id),
    source_event_id: String(event.comment_id),
    source: "github-issue-comment",
    approved_at: event.created_at,
  };
}

/** Validate the authenticated source before any approval is signed or stored. */
export function validateApprovalCaptureSource(
  event: GitHubApprovalEvent,
  attestation: ApprovalAttestation,
  policy: GitHubApprovalPolicy,
): void {
  if (
    event.repository !== policy.repository ||
    attestation.repository !== policy.repository ||
    event.issue_number !== policy.issue_number ||
    attestation.issue_number !== policy.issue_number ||
    event.comment_id !== attestation.comment_id ||
    !Number.isSafeInteger(event.comment_id) ||
    event.comment_id <= 0 ||
    event.author_id !== attestation.author_id ||
    !Number.isSafeInteger(event.author_id) ||
    event.author_id <= 0 ||
    !policy.allowed_human_ids.includes(event.author_id) ||
    event.author_type !== "User" ||
    event.created_at !== event.updated_at ||
    event.created_at !== attestation.approved_at ||
    !Number.isFinite(Date.parse(event.created_at)) ||
    !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$/.test(event.created_at) ||
    !/^[a-f0-9]{40}$/.test(attestation.sip_git_sha) ||
    !/^[a-f0-9]{64}$/.test(attestation.sip_sha256) ||
    !attestation.sip_revision.trim() ||
    !event.body.includes(attestation.sip_revision) ||
    !event.body.includes(attestation.sip_git_sha) ||
    !event.body.includes(attestation.sip_sha256)
  ) {
    throw new Error("Approval capture source is not trusted");
  }
}
