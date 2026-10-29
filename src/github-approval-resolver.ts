import { matchGitHubApprovalEvidence } from "./github-approval-evidence.ts";
import type {
  ApprovalAttestation,
  GitHubApprovalEvent,
  GitHubApprovalPolicy,
} from "./github-approval-evidence.ts";
import { validateSipApprovalReceipt } from "./sip-approval.ts";
import type {
  SipApprovalReceipt,
  VerifiedHumanApproval,
  VerifiedSipContent,
} from "./sip-approval.ts";

/**
 * All methods are implemented outside the domain by trusted infrastructure.
 * In particular, verifyAttestation MUST cryptographically authenticate an
 * independently stored immutable attestation, not merely parse a JSON file.
 */
export interface TrustedGitHubApprovalGateway {
  fetchComment(
    repository: string,
    commentId: number,
  ): Promise<GitHubApprovalEvent>;
  fetchSipAtCommit(
    repository: string,
    gitSha: string,
  ): Promise<VerifiedSipContent>;
  verifyAttestation(
    repository: string,
    commentId: number,
  ): Promise<ApprovalAttestation | undefined>;
}

export type ResolvedSipApproval = {
  sip: VerifiedSipContent;
  human: VerifiedHumanApproval;
};

/**
 * Resolve independent evidence before validating the journal receipt.
 * No fallback to actor labels, branch tips, unsigned JSON or user input.
 */
export async function resolveGitHubSipApproval(
  receipt: SipApprovalReceipt,
  policy: GitHubApprovalPolicy,
  gateway: TrustedGitHubApprovalGateway,
): Promise<ResolvedSipApproval> {
  if (!/^[a-f0-9]{40}$/.test(receipt.sip_git_sha)) {
    throw new Error("Full Git commit SHA required");
  }
  if (!/^[1-9][0-9]*$/.test(receipt.source_event_id)) {
    throw new Error("Numeric GitHub comment ID required");
  }
  const commentId = Number(receipt.source_event_id);
  if (!Number.isSafeInteger(commentId)) {
    throw new Error("Unsafe GitHub comment ID");
  }
  const event = await gateway.fetchComment(policy.repository, commentId);
  const attestation = await gateway.verifyAttestation(
    policy.repository,
    commentId,
  );
  const human = matchGitHubApprovalEvidence(
    receipt,
    event,
    attestation,
    policy,
  );
  const sip = await gateway.fetchSipAtCommit(
    policy.repository,
    receipt.sip_git_sha,
  );
  validateSipApprovalReceipt(receipt, sip, human);
  return { sip, human };
}
