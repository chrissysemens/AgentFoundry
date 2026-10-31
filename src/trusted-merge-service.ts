import type { TrustedGitHubApprovalGateway } from "./github-approval-resolver.ts";
import type { GitHubApprovalPolicy } from "./github-approval-evidence.ts";
import type { AuthenticatedGitHubGet } from "./github-readonly-gateway.ts";
import { createSignedGitHubMergeAuthorizationResolver } from "./github-merge-authorization.ts";
import type {
  MergeDecisionTrustPolicy,
  SignedMergeDecisionStore,
} from "./signed-merge-decision.ts";
import { replayWithVerifiedGitHubApprovals } from "./verified-approval-journal.ts";
import type { Payload, State } from "./domain.ts";
import type { Journal } from "./journal.ts";
import type { MergeAuthorizationResolver } from "./verified-merge-writer.ts";
import { VerifiedMergeAuthorizationWriter } from "./verified-merge-writer.ts";

/**
 * Service-facing merge authorization API. Keep the journal and resolver inside
 * a trusted process; never pass either to an untrusted caller.
 *
 * This API is not a process or database permission boundary. The deployment
 * must deny untrusted callers direct access to the SQLite file and writer.
 */
export class TrustedMergeService {
  private readonly writer: VerifiedMergeAuthorizationWriter;

  constructor(
    journal: Journal,
    ticket: string,
    allowedHumanIds: readonly number[],
    resolve: MergeAuthorizationResolver,
    verifiedState: (ticket: string) => Promise<State>,
  ) {
    this.writer = new VerifiedMergeAuthorizationWriter(
      journal,
      ticket,
      allowedHumanIds,
      resolve,
      verifiedState,
    );
  }

  authorizeMerge(
    ticket: string,
    actor: string,
    payload: Payload,
  ): Promise<State> {
    return this.writer.append(ticket, "MERGE_AUTHORIZED", actor, payload);
  }
}

/**
 * Build a merge service from authenticated, signed evidence and independently
 * verified approval replay. Run only in a process with protected journal access.
 */
export function createTrustedMergeService(
  journal: Journal,
  ticket: string,
  allowedHumanIds: readonly number[],
  resolveSignedDecision: MergeAuthorizationResolver,
  replayVerifiedApprovals: (ticket: string) => Promise<State>,
): TrustedMergeService {
  if (!allowedHumanIds.length) {
    throw new Error("At least one trusted human ID required");
  }
  return new TrustedMergeService(
    journal,
    ticket,
    allowedHumanIds,
    resolveSignedDecision,
    replayVerifiedApprovals,
  );
}

/**
 * Compose the authenticated GitHub comment, retained signed decision and
 * independent SIP approval replay in one trusted-process service.
 * Database file permissions must separately enforce writer isolation.
 */
export function createSignedGitHubTrustedMergeService(
  journal: Journal,
  ticket: string,
  allowedHumanIds: readonly number[],
  getGitHub: AuthenticatedGitHubGet,
  decisionStore: SignedMergeDecisionStore,
  decisionTrust: MergeDecisionTrustPolicy,
  repository: string,
  issueNumber: number,
  commentId: number,
  approvalPolicy: GitHubApprovalPolicy,
  approvalGateway: TrustedGitHubApprovalGateway,
): TrustedMergeService {
  if (
    approvalPolicy.repository !== repository ||
    approvalPolicy.issue_number !== issueNumber
  ) {
    throw new Error("Merge and SIP approval repository bindings differ");
  }
  if (
    allowedHumanIds.some((id) => !approvalPolicy.allowed_human_ids.includes(id))
  ) {
    throw new Error("Merge human allowlist exceeds SIP approval policy");
  }
  const resolve = createSignedGitHubMergeAuthorizationResolver(
    getGitHub,
    decisionStore,
    decisionTrust,
    repository,
    issueNumber,
    commentId,
  );
  const verifiedState = (id: string) =>
    replayWithVerifiedGitHubApprovals(
      id,
      journal.read(id),
      approvalPolicy,
      approvalGateway,
    );
  return createTrustedMergeService(
    journal,
    ticket,
    allowedHumanIds,
    resolve,
    verifiedState,
  );
}
