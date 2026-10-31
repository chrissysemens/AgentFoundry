import type { SignedMergeDecisionStore } from "./signed-merge-decision.ts";
import type { RetainedApprovalObjectReader } from "./retained-approval-store.ts";

/**
 * Read-only adapter. Object Lock, immutable retention, authenticated reads,
 * and revocation are responsibilities of the independently operated backend.
 */
export function createRetainedMergeDecisionStore(
  backend: RetainedApprovalObjectReader,
): SignedMergeDecisionStore {
  return {
    async get(repository, commentId): Promise<unknown> {
      const parts = repository.split("/");
      if (
        parts.length !== 2 ||
        parts.some(
          (part) =>
            !/^[A-Za-z0-9_.-]+$/.test(part) ||
            part === "." ||
            part === "..",
        )
      ) {
        throw new Error("Invalid merge decision repository");
      }
      if (!Number.isSafeInteger(commentId) || commentId <= 0) {
        throw new Error("Invalid merge decision comment ID");
      }
      const key = `merge-decisions/v1/${repository}/${commentId}.json`;
      const value = await backend.readRetainedObject(key);
      if (value === undefined) return undefined;
      if (typeof value !== "string" || value.length > 16384) {
        throw new Error("Invalid retained merge decision object");
      }
      try {
        return JSON.parse(value) as unknown;
      } catch {
        throw new Error("Malformed retained merge decision JSON");
      }
    },
  };
}
