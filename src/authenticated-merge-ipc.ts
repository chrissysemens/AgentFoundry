import { timingSafeEqual } from "node:crypto";
import type { TrustedMergeRequestHandler } from "./trusted-merge-request.ts";

/**
 * Narrow, constant-time shared-secret authentication for the writer IPC.
 * The secret must be provisioned independently of untrusted workers and
 * must never be accepted from a caller-selected environment or request field.
 *
 * This is defense in depth: the deployment must also restrict socket access
 * and deny untrusted identities database-directory write permissions.
 */
export function createAuthenticatedMergeHandler(
  secret: string,
  trustedHandler: TrustedMergeRequestHandler,
): TrustedMergeRequestHandler {
  if (!/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error("Writer IPC secret must be 32 random bytes in lowercase hex");
  }
  const expected = Buffer.from(secret, "hex");
  return async (input: unknown) => {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Invalid authenticated request");
    }
    const fields = Object.keys(input);
    if (
      fields.length !== 2 ||
      !fields.includes("credential") ||
      !fields.includes("request")
    ) {
      throw new Error("Invalid authenticated request");
    }
    const envelope = input as Record<string, unknown>;
    const credential = envelope.credential;
    if (typeof credential !== "string" || !/^[a-f0-9]{64}$/.test(credential)) {
      throw new Error("Authentication failed");
    }
    const received = Buffer.from(credential, "hex");
    if (!timingSafeEqual(expected, received)) {
      throw new Error("Authentication failed");
    }
    return trustedHandler(envelope.request);
  };
}
