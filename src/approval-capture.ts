import { digest } from "./domain.ts";
import { validateApprovalCaptureSource } from "./github-approval-evidence.ts";
import type {
  ApprovalAttestation,
  GitHubApprovalEvent,
  GitHubApprovalPolicy,
} from "./github-approval-evidence.ts";
import type { VerifiedSipContent } from "./sip-approval.ts";
import { approvalAttestationSigningBytes } from "./signed-approval-attestation.ts";
import type { SignedApprovalAttestation } from "./signed-approval-attestation.ts";
import type { ApprovalRetentionWriter, ApprovalSigner } from "./approval-capture-types.ts";

/**
 * Capture from independently authenticated GitHub and exact-commit SIP data.
 * The caller must supply an isolated signer and externally enforced retention.
 */
export async function captureApprovalEvidence(
  event: GitHubApprovalEvent,
  sip: VerifiedSipContent,
  policy: GitHubApprovalPolicy,
  signer: ApprovalSigner,
  retention: ApprovalRetentionWriter,
): Promise<SignedApprovalAttestation> {
  const payload: ApprovalAttestation = {
    repository: event.repository,
    issue_number: event.issue_number,
    comment_id: event.comment_id,
    author_id: event.author_id,
    sip_revision: sip.revision,
    sip_git_sha: sip.git_sha,
    sip_sha256: digest(sip.utf8_content),
    approved_at: event.created_at,
  };
  validateApprovalCaptureSource(event, payload, policy);
  if (!signer.keyId.trim()) throw new Error("Approval signing key ID required");
  const signature = await signer.signApproval(
    approvalAttestationSigningBytes(payload),
  );
  if (!Buffer.isBuffer(signature) || signature.length !== 64) {
    throw new Error("Invalid Ed25519 approval signature");
  }
  const signed: SignedApprovalAttestation = {
    payload,
    key_id: signer.keyId,
    signature_base64: signature.toString("base64"),
  };
  await retention.createOnce(event.repository, event.comment_id, signed);
  return signed;
}
