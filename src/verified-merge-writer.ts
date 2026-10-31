import type { Payload, State } from "./domain.ts";
import type { Journal } from "./journal.ts";
import { validateMergeAuthorization } from "./merge-authorization.ts";
import type { VerifiedMergeAuthorization } from "./merge-authorization.ts";

/**
 * The resolver must independently authenticate a fresh, human-issued decision
 * bound to the exact ticket, accepted commit, and Oracle review.
 * Never derive this evidence from caller-supplied event payloads.
 */
export type MergeAuthorizationResolver = (
  ticket: string,
) => Promise<VerifiedMergeAuthorization | undefined>;

/**
 * Gate merge authorization at the journal append boundary. Only expose this
 * wrapper to untrusted callers, never the underlying journal.
 */
export class VerifiedMergeAuthorizationWriter {
  private busy = false;

  constructor(
    private readonly journal: Journal,
    private readonly trustedTicket: string,
    private readonly allowedHumanIds: readonly number[],
    private readonly resolve: MergeAuthorizationResolver,
    private readonly verifiedState: (ticket: string) => Promise<State>,
  ) {
    if (!trustedTicket.trim()) throw new Error("Trusted ticket ID required");
  }

  async append(
    ticket: string,
    type: string,
    actor: string,
    payload: Payload = {},
  ): Promise<State> {
    if (ticket !== this.trustedTicket) {
      throw new Error("Ticket does not match trusted merge binding");
    }
    if (type !== "MERGE_AUTHORIZED") {
      throw new Error("Merge writer only accepts MERGE_AUTHORIZED events");
    }
    if (this.busy) throw new Error("Concurrent merge writes forbidden");
    this.busy = true;
    try {
      if (type === "MERGE_AUTHORIZED") {
        // The state loader must replay historical SIP approvals with their
        // independently verified evidence; raw replay would fail closed.
        const state = await this.verifiedState(ticket);
        const evidence = await this.resolve(ticket);
        validateMergeAuthorization(state, evidence, this.allowedHumanIds);
        if (actor !== `human:${evidence!.human_id}`) {
          throw new Error("Merge actor does not match verified human");
        }
        if (
          payload.implementation_id !== evidence!.implementation_id ||
          payload.code_revision !== evidence!.code_revision ||
          payload.review_id !== evidence!.review_id
        ) {
          throw new Error("Merge payload does not match verified decision");
        }
      }
      return this.journal.append(ticket, type, actor, payload);
    } finally {
      this.busy = false;
    }
  }
}
