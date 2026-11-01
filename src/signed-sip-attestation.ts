import { createPublicKey, verify } from "node:crypto";
import type { ApprovalAttestation } from "./github-approval-evidence.ts";

export interface SignedSipApprovalAttestation {
  payload: ApprovalAttestation;
  key_id: string;
  signature_base64: string;
}

export interface SignedSipApprovalAttestationStore {
  get(repository: string, commentId: number): Promise<unknown>;
}

export interface SipAttestationTrustPolicy {
  trusted_keys: Readonly<Record<string, string>>;
  revoked_key_ids?: readonly string[];
}

export function sipAttestationSigningBytes(
  payload: ApprovalAttestation,
): Buffer {
  return Buffer.from(
    JSON.stringify([
      "agent-foundry-sip-attestation-v1",
      payload.repository,
      payload.issue_number,
      payload.comment_id,
      payload.author_id,
      payload.sip_revision,
      payload.sip_git_sha,
      payload.sip_sha256,
      payload.approved_at,
    ]),
    "utf8",
  );
}

/**
 * Cryptographically authenticate a retained SIP approval. The store must
 * independently guarantee immutability, provenance and revocation handling.
 */
export async function verifySignedSipApprovalAttestation(
  store: SignedSipApprovalAttestationStore,
  trust: SipAttestationTrustPolicy,
  repository: string,
  commentId: number,
): Promise<ApprovalAttestation | undefined> {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !Number.isSafeInteger(commentId) ||
    commentId <= 0
  ) {
    throw new Error("Invalid SIP attestation lookup");
  }
  const raw: unknown = await store.get(repository, commentId);
  if (raw === undefined || raw === null) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Malformed signed SIP attestation");
  }
  const entry = raw as Record<string, unknown>;
  const payload = entry.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Malformed signed SIP attestation payload");
  }
  const data = payload as Record<string, unknown>;
  const exact = (object: Record<string, unknown>, fields: string[]) =>
    Object.keys(object).length === fields.length &&
    fields.every((field) => Object.hasOwn(object, field));
  if (
    !exact(entry, ["payload", "key_id", "signature_base64"]) ||
    !exact(data, [
      "repository",
      "issue_number",
      "comment_id",
      "author_id",
      "sip_revision",
      "sip_git_sha",
      "sip_sha256",
      "approved_at",
    ]) ||
    data.repository !== repository ||
    !Number.isSafeInteger(data.issue_number) ||
    (data.issue_number as number) <= 0 ||
    data.comment_id !== commentId ||
    !Number.isSafeInteger(data.author_id) ||
    (data.author_id as number) <= 0 ||
    typeof data.sip_revision !== "string" ||
    !data.sip_revision.trim() ||
    typeof data.sip_git_sha !== "string" ||
    !/^[a-f0-9]{40}$/.test(data.sip_git_sha) ||
    typeof data.sip_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.sip_sha256) ||
    typeof data.approved_at !== "string" ||
    !Number.isFinite(Date.parse(data.approved_at)) ||
    typeof entry.key_id !== "string" ||
    !entry.key_id ||
    typeof entry.signature_base64 !== "string" ||
    !/^[A-Za-z0-9+/]{86}==$/.test(entry.signature_base64)
  ) {
    throw new Error("Invalid signed SIP attestation");
  }
  if (trust.revoked_key_ids?.includes(entry.key_id)) {
    throw new Error("Revoked SIP attestation key");
  }
  const publicPem = Object.hasOwn(trust.trusted_keys, entry.key_id)
    ? trust.trusted_keys[entry.key_id]
    : undefined;
  if (!publicPem) throw new Error("Untrusted SIP attestation key");
  const key = createPublicKey(publicPem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("SIP attestation key must be Ed25519");
  }
  if (
    !verify(
      null,
      sipAttestationSigningBytes(data as ApprovalAttestation),
      key,
      Buffer.from(entry.signature_base64, "base64"),
    )
  ) {
    throw new Error("Invalid SIP attestation signature");
  }
  return data as ApprovalAttestation;
}
