import type { State } from "./domain.ts";
import type { TrustedMergeService } from "./trusted-merge-service.ts";

/**
 * Minimal request surface for a separately deployed trusted writer.
 * The server must authenticate its caller at the transport boundary; this
 * module intentionally has no HTTP listener, token parser or DB access.
 *
 * The client cannot select the ticket, actor or authorization payload.
 * All three are derived from independently verified merge evidence.
 */
export interface TrustedMergeRequest {
  readonly operation: "authorize-merge";
}

export type TrustedMergeRequestHandler = (
  request: unknown,
) => Promise<State>;

export function createTrustedMergeRequestHandler(
  service: TrustedMergeService,
  ticket: string,
  resolveVerifiedRequest: () => Promise<{
    humanId: number;
    implementationId: string;
    codeRevision: string;
    reviewId: string;
  }>,
): TrustedMergeRequestHandler {
  if (!ticket.trim()) throw new Error("Trusted ticket required");
  return async (request: unknown) => {
    if (
      request === null ||
      typeof request !== "object" ||
      Array.isArray(request) ||
      Object.keys(request).length !== 1 ||
      (request as { operation?: unknown }).operation !== "authorize-merge"
    ) {
      throw new Error("Invalid trusted merge request");
    }
    // This callback must resolve independently authenticated evidence within
    // the protected service, not read values from request or worker claims.
    const verified = await resolveVerifiedRequest();
    return service.authorizeMerge(ticket, `human:${verified.humanId}`, {
      implementation_id: verified.implementationId,
      code_revision: verified.codeRevision,
      review_id: verified.reviewId,
    });
  };
}
