import type { AuthenticatedGitHubGet } from "./github-readonly-gateway.ts";
import { createReadOnlyGitHubApprovalGateway } from "./github-readonly-gateway.ts";
import type { TrustedGitHubApprovalGateway } from "./github-approval-resolver.ts";
import { verifySignedApprovalAttestation } from "./signed-approval-attestation.ts";
import type {
  AttestationTrustPolicy,
  ImmutableApprovalAttestationStore,
} from "./signed-approval-attestation.ts";

/**
 * Compose the GitHub read adapter with independent signed evidence.
 * The caller must supply an authenticated GitHub transport and a separately
 * controlled, append-only attestation store. This function does not create
 * either trust boundary.
 */
export function createVerifiedGitHubApprovalGateway(
  get: AuthenticatedGitHubGet,
  sipPath: string,
  revision: string,
  store: ImmutableApprovalAttestationStore,
  trust: AttestationTrustPolicy,
  trustedRevisionsByCommit?: Readonly<Record<string, string>>,
): TrustedGitHubApprovalGateway {
  const github = createReadOnlyGitHubApprovalGateway(
    get,
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
      verifySignedApprovalAttestation(store, trust, repository, commentId),
  };
}
