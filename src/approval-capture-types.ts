import type { SignedApprovalAttestation } from "./signed-approval-attestation.ts";

/** Signing credentials must be isolated from development agents and CI. */
export interface ApprovalSigner {
  readonly keyId: string;
  signApproval(bytes: Buffer): Promise<Buffer>;
}

/** Backend must enforce atomic write-once semantics and durable retention. */
export interface ApprovalRetentionWriter {
  createOnce(
    repository: string,
    commentId: number,
    signed: SignedApprovalAttestation,
  ): Promise<void>;
}
