import { resolveGitHubSipApproval } from "./github-approval-resolver.ts";
import type { TrustedGitHubApprovalGateway } from "./github-approval-resolver.ts";
import type { GitHubApprovalPolicy } from "./github-approval-evidence.ts";
import type { ApprovalEvidenceVerifier, Event } from "./domain.ts";
import type { SipApprovalReceipt } from "./sip-approval.ts";

/**
 * Resolve every approval before synchronous journal replay. Never accept an
 * unverified receipt merely because it already appears in event history.
 */
export async function prepareVerifiedApprovalVerifier(
  events: readonly Event[],
  policy: GitHubApprovalPolicy,
  gateway: TrustedGitHubApprovalGateway,
): Promise<ApprovalEvidenceVerifier> {
  const verified = new Map<
    string,
    Awaited<ReturnType<typeof resolveGitHubSipApproval>>
  >();
  for (const event of events) {
    if (event.event_type !== "SIP_APPROVED") continue;
    const receipt = event.payload.receipt as SipApprovalReceipt | undefined;
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
      throw new Error("Approval receipt required for verified replay");
    }
    const identity = JSON.stringify(receipt);
    if (!verified.has(identity)) {
      verified.set(
        identity,
        await resolveGitHubSipApproval(receipt, policy, gateway),
      );
    }
  }
  return (receipt) => verified.get(JSON.stringify(receipt));
}
