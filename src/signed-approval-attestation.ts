import { createPublicKey, verify } from "node:crypto";
import type { ApprovalAttestation } from "./github-approval-evidence.ts";

export type SignedApprovalAttestation = {
  payload: ApprovalAttestation;
  signature_base64: string;
  key_id: string;
};

/**
 * The trusted store MUST be append-only and outside the repository/journal.
 * Its implementation must authenticate access and reject altered or revoked
 * entries. This interface alone does not establish storage immutability.
 */
export interface ImmutableApprovalAttestationStore {
  get(repository: string, commentId: number): Promise<unknown>;
}

export type AttestationTrustPolicy = {
  /** Public keys are configured by the operator, never taken from an event. */
  trusted_keys: Readonly<Record<string, string>>;
};

const canonical = (a: ApprovalAttestation): string =>
  JSON.stringify([
    "agent-foundry-sip-approval-v1",
    a.repository,
    a.issue_number,
    a.comment_id,
    a.author_id,
    a.sip_revision,
    a.sip_git_sha,
    a.sip_sha256,
    a.approved_at,
  ]);

function isAttestation(value: unknown): value is ApprovalAttestation {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.repository === "string" &&
    Number.isSafeInteger(a.issue_number) &&
    Number.isSafeInteger(a.comment_id) &&
    Number.isSafeInteger(a.author_id) &&
    typeof a.sip_revision === "string" &&
    typeof a.sip_git_sha === "string" &&
    typeof a.sip_sha256 === "string" &&
    typeof a.approved_at === "string"
  );
}

/**
 * Verifies Ed25519 signatures over a domain-separated canonical payload.
 * Signed evidence must also be retained by a separately trusted immutable
 * store; a valid signature alone does not prove non-revocation or chronology.
 */
export async function verifySignedApprovalAttestation(
  store: ImmutableApprovalAttestationStore,
  trust: AttestationTrustPolicy,
  repository: string,
  commentId: number,
): Promise<ApprovalAttestation | undefined> {
  const raw = await store.get(repository, commentId);
  if (raw === undefined || raw === null) return undefined;
  if (!raw || typeof raw !== "object") {
    throw new Error("Malformed signed approval attestation");
  }
  const entry = raw as Record<string, unknown>;
  if (
    !isAttestation(entry.payload) ||
    typeof entry.key_id !== "string" ||
    typeof entry.signature_base64 !== "string" ||
    !/^[A-Za-z0-9+/]{86}==$/.test(entry.signature_base64)
  ) {
    throw new Error("Malformed signed approval attestation");
  }
  const publicKey = Object.hasOwn(trust.trusted_keys, entry.key_id)
    ? trust.trusted_keys[entry.key_id]
    : undefined;
  if (!publicKey) throw new Error("Untrusted approval signing key");
  if (
    entry.payload.repository !== repository ||
    entry.payload.comment_id !== commentId
  ) {
    throw new Error("Signed approval identity mismatch");
  }
  const key = createPublicKey(publicKey);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("Approval signing key must be Ed25519");
  }
  const valid = verify(
    null,
    Buffer.from(canonical(entry.payload), "utf8"),
    key,
    Buffer.from(entry.signature_base64, "base64"),
  );
  if (!valid) throw new Error("Invalid approval attestation signature");
  return entry.payload;
}

/** Canonical bytes for a separately trusted signer to sign. */
export function approvalAttestationSigningBytes(
  attestation: ApprovalAttestation,
): Buffer {
  if (!isAttestation(attestation)) {
    throw new Error("Malformed approval attestation payload");
  }
  return Buffer.from(canonical(attestation), "utf8");
}
