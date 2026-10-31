import type { TrustedGitHubApprovalGateway } from "./github-approval-resolver.ts";
import type { GitHubApprovalPolicy } from "./github-approval-evidence.ts";
import type {
  ApprovalRetentionWriter,
  ApprovalSigner,
} from "./approval-capture-types.ts";
import { captureApprovalEvidence } from "./approval-capture.ts";
import type { SignedApprovalAttestation } from "./signed-approval-attestation.ts";

/**
 * The requested SIP commit is operator-trusted input, not parsed from a comment.
 * The gateway must authenticate GitHub and retrieve exact-commit SIP bytes.
 */
export async function captureGitHubApproval(
  gateway: Pick<
    TrustedGitHubApprovalGateway,
    "fetchComment" | "fetchSipAtCommit"
  >,
  policy: GitHubApprovalPolicy,
  commentId: number,
  trustedSipGitSha: string,
  signer: ApprovalSigner,
  retention: ApprovalRetentionWriter,
): Promise<SignedApprovalAttestation> {
  if (!Number.isSafeInteger(commentId) || commentId <= 0) {
    throw new Error("Invalid approval comment ID");
  }
  if (!/^[a-f0-9]{40}$/.test(trustedSipGitSha)) {
    throw new Error("Trusted SIP commit must be a full Git SHA");
  }
  const event = await gateway.fetchComment(policy.repository, commentId);
  if (
    event.repository !== policy.repository ||
    event.issue_number !== policy.issue_number ||
    event.comment_id !== commentId
  ) {
    throw new Error("Authenticated GitHub comment identity mismatch");
  }
  const sip = await gateway.fetchSipAtCommit(policy.repository, trustedSipGitSha);
  if (sip.git_sha !== trustedSipGitSha) {
    throw new Error("Authenticated SIP commit identity mismatch");
  }
  return captureApprovalEvidence(event, sip, policy, signer, retention);
}
