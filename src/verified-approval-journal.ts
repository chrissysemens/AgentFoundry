import { reduceEvents } from "./domain.ts";
import type { Event, State } from "./domain.ts";
import { prepareVerifiedApprovalVerifier } from "./verified-approval-replay.ts";
import type { TrustedGitHubApprovalGateway } from "./github-approval-resolver.ts";
import type { GitHubApprovalPolicy } from "./github-approval-evidence.ts";

/**
 * Replay a supplied event history only after resolving its approval evidence.
 * This is a read-only boundary: it does not append to or mutate the journal.
 * Production append authorization requires an equally trusted write path.
 */
export async function replayWithVerifiedGitHubApprovals(
  ticketId: string,
  events: readonly Event[],
  policy: GitHubApprovalPolicy,
  gateway: TrustedGitHubApprovalGateway,
): Promise<State> {
  const snapshot = structuredClone(events) as Event[];
  const verifier = await prepareVerifiedApprovalVerifier(
    snapshot,
    policy,
    gateway,
  );
  return reduceEvents(ticketId, snapshot, verifier);
}
