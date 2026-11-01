import { SQLiteJournal } from "./journal.ts";
import { assertTrustedWriterFilesystem } from "./trusted-writer-filesystem.ts";
import { createSignedGitHubMergeAuthorizationResolver } from "./github-merge-authorization.ts";
import { createSignedGitHubTrustedMergeService } from "./trusted-merge-service.ts";
import { createTrustedMergeRequestHandler } from "./trusted-merge-request.ts";
import { runTrustedWriterProcess } from "./trusted-writer-process.ts";
import { parseTrustedWriterBootstrapConfig } from "./trusted-writer-bootstrap-config.ts";
import type { AuthenticatedGitHubGet } from "./github-readonly-gateway.ts";
import type { GitHubApprovalPolicy } from "./github-approval-evidence.ts";
import type { TrustedGitHubApprovalGateway } from "./github-approval-resolver.ts";
import type {
  MergeDecisionTrustPolicy,
  SignedMergeDecisionStore,
} from "./signed-merge-decision.ts";

/**
 * Trusted dependencies must be constructed inside the protected process from
 * independently provisioned keys, authenticated API access and retained
 * immutable attestations. Never build them from IPC request fields.
 */
export interface TrustedWriterEvidenceDependencies {
  readonly getGitHub: AuthenticatedGitHubGet;
  readonly decisionStore: SignedMergeDecisionStore;
  readonly decisionTrust: MergeDecisionTrustPolicy;
  readonly approvalPolicy: GitHubApprovalPolicy;
  readonly approvalGateway: TrustedGitHubApprovalGateway;
}

/**
 * Compose the real privileged journal, independently verified evidence,
 * minimal request handler and authenticated process lifecycle.
 *
 * This is an embeddable bootstrap, not a CLI accepting arbitrary callbacks.
 * Provisioning, cross-UID access and isolation must be validated separately.
 */
export async function runEvidenceBackedTrustedWriter(
  rawConfig: unknown,
  dependencies: TrustedWriterEvidenceDependencies,
): Promise<void> {
  const config = parseTrustedWriterBootstrapConfig(rawConfig);
  if (
    dependencies.approvalPolicy.repository !== config.repository ||
    dependencies.approvalPolicy.issue_number !== config.issueNumber
  ) {
    throw new Error("Writer and SIP approval policy bindings differ");
  }
  assertTrustedWriterFilesystem(config.databasePath, config.socketPath);
  const journal = new SQLiteJournal(config.databasePath, undefined, true);
  try {
    const service = createSignedGitHubTrustedMergeService(
      journal,
      config.ticket,
      config.allowedHumanIds,
      dependencies.getGitHub,
      dependencies.decisionStore,
      dependencies.decisionTrust,
      config.repository,
      config.issueNumber,
      config.commentId,
      dependencies.approvalPolicy,
      dependencies.approvalGateway,
    );
    // The request cannot select a ticket, human, revision or review.
    // Resolve the decision inside the service via the signed GitHub resolver.
    // The service performs an independent second resolution before writing.
    const resolve = async () => {
      const decision = await createSignedGitHubMergeAuthorizationResolver(
        dependencies.getGitHub,
        dependencies.decisionStore,
        dependencies.decisionTrust,
        config.repository,
        config.issueNumber,
        config.commentId,
      )(config.ticket);
      if (!decision) throw new Error("Verified merge decision unavailable");
      return {
        humanId: decision.human_id,
        implementationId: decision.implementation_id,
        codeRevision: decision.code_revision,
        reviewId: decision.review_id,
      };
    };
    const handler = createTrustedMergeRequestHandler(
      service,
      config.ticket,
      resolve,
    );
    await runTrustedWriterProcess(
      config.databasePath,
      config.socketPath,
      config.credentialPath,
      handler,
    );
  } finally {
    journal.close();
  }
}
