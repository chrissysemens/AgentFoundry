import type { ApprovalEvidenceVerifier, Payload, State } from "./domain.ts";
import type { GitHubApprovalPolicy } from "./github-approval-evidence.ts";
import type { TrustedGitHubApprovalGateway } from "./github-approval-resolver.ts";
import { resolveGitHubSipApproval } from "./github-approval-resolver.ts";
import type { Journal } from "./journal.ts";
import type { SipApprovalReceipt } from "./sip-approval.ts";

/**
 * Construct the journal with this verifier, and expose only append() to
 * untrusted callers. Never expose the underlying synchronous journal: doing
 * so would bypass the async evidence resolution boundary.
 *
 * The verifier caches authenticated receipts for synchronous replay. On
 * restart, historical approvals must be reverified before any journal writes.
 */
export class VerifiedApprovalWriter {
  private readonly verified = new Map<
    string,
    Awaited<ReturnType<typeof resolveGitHubSipApproval>>
  >();
  private readonly journal: Journal;
  private busy = false;

  constructor(
    createJournal: (verifier: ApprovalEvidenceVerifier) => Journal,
    private readonly policy: GitHubApprovalPolicy,
    private readonly gateway: TrustedGitHubApprovalGateway,
  ) {
    this.journal = createJournal((receipt) =>
      this.verified.get(JSON.stringify(receipt)),
    );
  }

  async append(
    ticket: string,
    type: string,
    actor: string,
    payload: Payload = {},
  ): Promise<State> {
    if (this.busy) throw new Error("Concurrent verified writes forbidden");
    this.busy = true;
    try {
      // Authenticate all historical approvals before any synchronous replay.
      // Recheck each time: do not carry forward stale cached authorization.
      const next = new Map<
        string,
        Awaited<ReturnType<typeof resolveGitHubSipApproval>>
      >();
      for (const event of this.journal.read(ticket)) {
        if (event.event_type !== "SIP_APPROVED") continue;
        const receipt = event.payload.receipt;
        if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
          throw new Error("Historical approval receipt required");
        }
        const candidate = receipt as SipApprovalReceipt;
        next.set(
          JSON.stringify(candidate),
          await resolveGitHubSipApproval(candidate, this.policy, this.gateway),
        );
      }
      if (type === "SIP_APPROVED") {
        const receipt = payload.receipt;
        if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
          throw new Error("Approval receipt required");
        }
        const candidate = receipt as SipApprovalReceipt;
        next.set(
          JSON.stringify(candidate),
          await resolveGitHubSipApproval(candidate, this.policy, this.gateway),
        );
      }
      this.verified.clear();
      for (const [key, value] of next) this.verified.set(key, value);
      try {
        return this.journal.append(ticket, type, actor, payload);
      } finally {
        this.verified.clear();
      }
    } finally {
      this.busy = false;
    }
  }
}
