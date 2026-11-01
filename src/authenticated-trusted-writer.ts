import { readFileSync, lstatSync } from "node:fs";
import { createAuthenticatedMergeHandler } from "./authenticated-merge-ipc.ts";
import { startTrustedWriterRuntime } from "./trusted-writer-runtime.ts";
import type { TrustedMergeRequestHandler } from "./trusted-merge-request.ts";
import type { TrustedWriterRuntime } from "./trusted-writer-runtime.ts";

/**
 * Compose authenticated IPC and the protected writer runtime.
 *
 * The trusted process must build its own evidence-backed handler. Never load
 * handler code or authorization evidence from an untrusted worker request.
 * The secret file must be provisioned out of band, not from CLI arguments.
 */
export async function startAuthenticatedTrustedWriter(
  databasePath: string,
  socketPath: string,
  secretFile: string,
  trustedHandler: TrustedMergeRequestHandler,
): Promise<TrustedWriterRuntime> {
  if (!secretFile.startsWith("/")) {
    throw new Error("Absolute credential file path required");
  }
  const info = lstatSync(secretFile);
  const uid = process.getuid?.();
  if (
    !info.isFile() ||
    uid === undefined ||
    info.uid !== uid ||
    (info.mode & 0o077) !== 0
  ) {
    throw new Error("Writer credential must be a private writer-owned file");
  }
  const secret = readFileSync(secretFile, "utf8").trim();
  const handler = createAuthenticatedMergeHandler(secret, trustedHandler);
  return startTrustedWriterRuntime(databasePath, socketPath, handler);
}
