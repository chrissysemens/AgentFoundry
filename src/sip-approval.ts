import { createHash } from "node:crypto";

/**
 * An approval receipt is evidence to be verified by a trusted integration.
 * Its presence alone is NOT proof of human authorization.
 */
export type SipApprovalReceipt = {
  sip_revision: string;
  sip_sha256: string;
  sip_git_sha: string;
  approver_id: string;
  approved_at: string;
  source: string;
  source_event_id: string;
};

export type VerifiedSipContent = {
  revision: string;
  git_sha: string;
  utf8_content: string;
};

export type VerifiedHumanApproval = {
  /** Identity established by an external, trusted authentication boundary. */
  approver_id: string;
  /** Immutable event identifier independently resolved from that boundary. */
  source_event_id: string;
  source: string;
  approved_at: string;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");
const isSha = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const isDigest = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Validate the exact SIP bytes and independently established approval identity.
 * The caller must fetch the SIP bytes by Git SHA and authenticate the approval
 * event outside the domain. Do not construct VerifiedHumanApproval from an
 * untrusted journal actor label or user-supplied payload.
 */
export function validateSipApprovalReceipt(
  receipt: SipApprovalReceipt,
  sip: VerifiedSipContent,
  human: VerifiedHumanApproval,
): void {
  if (!isSha(receipt.sip_git_sha) || !isSha(sip.git_sha)) {
    throw new Error("Full 40-character Git SHA required");
  }
  if (!isDigest(receipt.sip_sha256)) {
    throw new Error("Full 64-character SIP SHA-256 required");
  }
  if (
    receipt.sip_revision !== sip.revision ||
    receipt.sip_git_sha !== sip.git_sha
  ) {
    throw new Error("SIP revision or Git SHA mismatch");
  }
  if (receipt.sip_sha256 !== sha256(sip.utf8_content)) {
    throw new Error("SIP content digest mismatch");
  }
  if (
    ![receipt.approver_id, receipt.source, receipt.source_event_id].every(
      isText,
    )
  ) {
    throw new Error("Approval provenance is incomplete");
  }
  if (
    receipt.approver_id !== human.approver_id ||
    receipt.source !== human.source ||
    receipt.source_event_id !== human.source_event_id ||
    receipt.approved_at !== human.approved_at
  ) {
    throw new Error("Approval does not match verified human event");
  }
  if (
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]+)?Z$/.test(
      receipt.approved_at,
    ) ||
    !Number.isFinite(Date.parse(receipt.approved_at)) ||
    new Date(receipt.approved_at).toISOString() !==
      new Date(Date.parse(receipt.approved_at)).toISOString()
  ) {
    throw new Error("Valid UTC approval timestamp required");
  }
}
