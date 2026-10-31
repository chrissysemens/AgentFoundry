import { createPublicKey, verify } from "node:crypto";
import type { VerifiedMergeAuthorization } from "./merge-authorization.ts";

export interface SignedMergeDecision {
  payload: VerifiedMergeAuthorization & {
    repository: string;
    issue_number: number;
    comment_id: number;
  };
  key_id: string;
  signature_base64: string;
}

export interface SignedMergeDecisionStore {
  get(repository: string, commentId: number): Promise<unknown>;
}

export interface MergeDecisionTrustPolicy {
  trusted_keys: Readonly<Record<string, string>>;
}

export function mergeDecisionSigningBytes(
  payload: SignedMergeDecision["payload"],
): Buffer {
  return Buffer.from(
    JSON.stringify([
      "agent-foundry-merge-decision-v1",
      payload.repository,
      payload.issue_number,
      payload.comment_id,
      payload.ticket_id,
      payload.implementation_id,
      payload.code_revision,
      payload.review_id,
      payload.human_id,
      payload.authorized_at,
    ]),
    "utf8",
  );
}

export async function verifySignedMergeDecision(
  store: SignedMergeDecisionStore,
  trust: MergeDecisionTrustPolicy,
  repository: string,
  issueNumber: number,
  commentId: number,
): Promise<VerifiedMergeAuthorization | undefined> {
  const raw = await store.get(repository, commentId);
  if (raw === undefined || raw === null) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Malformed signed merge decision");
  }
  const entry = raw as Record<string, unknown>;
  const p = entry.payload;
  if (!p || typeof p !== "object" || Array.isArray(p)) {
    throw new Error("Malformed signed merge decision payload");
  }
  const a = p as Record<string, unknown>;
  if (
    a.repository !== repository ||
    a.issue_number !== issueNumber ||
    a.comment_id !== commentId ||
    typeof a.ticket_id !== "string" ||
    !a.ticket_id ||
    typeof a.implementation_id !== "string" ||
    !a.implementation_id ||
    typeof a.code_revision !== "string" ||
    !/^[a-f0-9]{40}$/.test(a.code_revision) ||
    typeof a.review_id !== "string" ||
    !a.review_id ||
    !Number.isSafeInteger(a.human_id) ||
    (a.human_id as number) <= 0 ||
    typeof a.authorized_at !== "string" ||
    !Number.isFinite(Date.parse(a.authorized_at)) ||
    typeof entry.key_id !== "string" ||
    typeof entry.signature_base64 !== "string" ||
    !/^[A-Za-z0-9+/]{86}==$/.test(entry.signature_base64)
  ) {
    throw new Error("Malformed signed merge decision");
  }
  const publicKey = Object.hasOwn(trust.trusted_keys, entry.key_id)
    ? trust.trusted_keys[entry.key_id]
    : undefined;
  if (!publicKey) throw new Error("Untrusted merge decision signing key");
  const key = createPublicKey(publicKey);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("Merge signing key must be Ed25519");
  }
  if (
    !verify(
      null,
      mergeDecisionSigningBytes(a as unknown as SignedMergeDecision["payload"]),
      key,
      Buffer.from(entry.signature_base64, "base64"),
    )
  ) {
    throw new Error("Invalid merge decision signature");
  }
  return a as unknown as VerifiedMergeAuthorization;
}
