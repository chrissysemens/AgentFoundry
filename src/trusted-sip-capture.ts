import { createPrivateKey, sign } from "node:crypto";
import { validateApprovalCaptureSource } from "./github-approval-evidence.ts";
import { sipAttestationSigningBytes } from "./signed-sip-attestation.ts";
import type {
  ApprovalAttestation,
  GitHubApprovalEvent,
  GitHubApprovalPolicy,
} from "./github-approval-evidence.ts";
import type { SignedSipApprovalAttestation } from "./signed-sip-attestation.ts";

/**
 * This interface must be backed by independently protected, append-only
 * storage. An in-memory map or worker-writable file is not sufficient.
 */
export interface ImmutableSipAttestationSink {
  putIfAbsent(
    repository: string,
    commentId: number,
    signed: SignedSipApprovalAttestation,
  ): Promise<boolean>;
}

export interface TrustedSipCaptureDependencies {
  fetchComment(
    repository: string,
    commentId: number,
  ): Promise<GitHubApprovalEvent>;
  sink: ImmutableSipAttestationSink;
  privateKeyPem: string;
  keyId: string;
}

/**
 * Capture only after authenticating the original GitHub comment.
 * The sink must atomically refuse replacement of an existing record.
 */
export async function captureSignedSipApproval(
  policy: GitHubApprovalPolicy,
  attestation: ApprovalAttestation,
  dependencies: TrustedSipCaptureDependencies,
): Promise<SignedSipApprovalAttestation> {
  if (!dependencies.keyId.trim()) {
    throw new Error("Signing key ID required");
  }
  const event = await dependencies.fetchComment(
    policy.repository,
    attestation.comment_id,
  );
  validateApprovalCaptureSource(event, attestation, policy);
  const key = createPrivateKey(dependencies.privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("SIP capture signing key must be Ed25519");
  }
  const signed: SignedSipApprovalAttestation = {
    payload: { ...attestation },
    key_id: dependencies.keyId,
    signature_base64: sign(
      null,
      sipAttestationSigningBytes(attestation),
      key,
    ).toString("base64"),
  };
  if (
    !(await dependencies.sink.putIfAbsent(
      attestation.repository,
      attestation.comment_id,
      signed,
    ))
  ) {
    throw new Error("SIP approval attestation already retained");
  }
  return signed;
}
