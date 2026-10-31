import type { ImmutableApprovalAttestationStore } from "./signed-approval-attestation.ts";

/**
 * The backend must enforce retention/Object Lock outside GitHub, disallow
 * deletion and overwrites, and authenticate reads. This adapter cannot
 * establish those guarantees on its own.
 */
export interface RetainedApprovalObjectReader {
  readRetainedObject(key: string): Promise<string | undefined>;
}

function evidenceKey(repository: string, commentId: number): string {
  const parts = repository.split("/");
  if (
    parts.length !== 2 ||
    parts.some(
      (part) =>
        !/^[A-Za-z0-9_.-]+$/.test(part) || part === "." || part === "..",
    )
  ) {
    throw new Error("Invalid attestation repository");
  }
  if (!Number.isSafeInteger(commentId) || commentId <= 0) {
    throw new Error("Invalid attestation comment ID");
  }
  return `sip-approvals/v1/${repository}/${commentId}.json`;
}

/**
 * Read-only adapter for an operator-controlled, retention-enforced object
 * store. Missing records fail closed in the signature verifier; malformed
 * JSON is rejected. The backend's retention policy must be audited separately.
 */
export function createRetainedApprovalAttestationStore(
  backend: RetainedApprovalObjectReader,
): ImmutableApprovalAttestationStore {
  return {
    async get(repository, commentId): Promise<unknown> {
      const value = await backend.readRetainedObject(
        evidenceKey(repository, commentId),
      );
      if (value === undefined) return undefined;
      if (typeof value !== "string" || value.length > 16384) {
        throw new Error("Invalid retained approval object");
      }
      try {
        return JSON.parse(value) as unknown;
      } catch {
        throw new Error("Malformed retained approval JSON");
      }
    },
  };
}
