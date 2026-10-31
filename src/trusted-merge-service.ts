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
export async function createSignedTrustedMergeService(
  journal: Journal,
  ticket: string,
  allowedHumanIds: readonly number[],
  resolveSignedDecision: MergeAuthorizationResolver,
  replayVerifiedApprovals: (ticket: string) => Promise<State>,
): Promise<TrustedMergeService> {
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
