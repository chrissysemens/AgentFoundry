import { createReadOnlyGitHubApprovalGateway } from "./github-readonly-gateway.ts";
import { verifySignedSipApprovalAttestation } from "./signed-sip-attestation.ts";
import type { AuthenticatedGitHubGet } from "./github-readonly-gateway.ts";
import type { TrustedGitHubApprovalGateway } from "./github-approval-resolver.ts";
import type {
  SignedSipApprovalAttestationStore,
  SipAttestationTrustPolicy,
} from "./signed-sip-attestation.ts";

/**
 * Compose authenticated GitHub reads with independently signed SIP evidence.
 * An unsigned or absent record cannot authorize an approval.
 */
export function createSignedSipApprovalGateway(
  getGitHub: AuthenticatedGitHubGet,
  sipPath: string,
  revision: string,
  store: SignedSipApprovalAttestationStore,
  trust: SipAttestationTrustPolicy,
  trustedRevisionsByCommit?: Readonly<Record<string, string>>,
): TrustedGitHubApprovalGateway {
  const github = createReadOnlyGitHubApprovalGateway(
    getGitHub,
    sipPath,
    revision,
    trustedRevisionsByCommit,
  );
  return {
    fetchComment: (repository, commentId) =>
      github.fetchComment(repository, commentId),
    fetchSipAtCommit: (repository, gitSha) =>
      github.fetchSipAtCommit(repository, gitSha),
    verifyAttestation: (repository, commentId) =>
      verifySignedSipApprovalAttestation(
        store,
        trust,
        repository,
        commentId,
      ),
  };
}
