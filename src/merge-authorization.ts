import type { State } from "./domain.ts";

/**
 * The caller must independently authenticate a human approval. Actor labels
 * and GitHub comment text are never sufficient evidence.
 */
export interface VerifiedMergeAuthorization {
  readonly ticket_id: string;
  readonly implementation_id: string;
  readonly code_revision: string;
  readonly review_id: string;
  readonly human_id: number;
  readonly authorized_at: string;
}

export function validateMergeAuthorization(
  state: State,
  evidence: VerifiedMergeAuthorization | undefined,
  allowedHumanIds: readonly number[],
): void {
  if (
    state.status !== "ACCEPTED" ||
    !evidence ||
    evidence.ticket_id !== state.ticket_id ||
    evidence.implementation_id !== state.implementation_id ||
    evidence.code_revision !== state.accepted_revision ||
    evidence.review_id !== state.last_review_id ||
    !Number.isSafeInteger(evidence.human_id) ||
    evidence.human_id <= 0 ||
    !allowedHumanIds.includes(evidence.human_id) ||
    !Number.isFinite(Date.parse(evidence.authorized_at))
  ) {
    throw new Error("Trusted human merge authorization unavailable");
  }
}
