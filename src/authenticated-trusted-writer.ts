import {
  closeSync,
  fstatSync,
  openSync,
  readFileSync,
  constants,
} from "node:fs";
import { isAbsolute } from "node:path";
import { createAuthenticatedMergeHandler } from "./authenticated-merge-ipc.ts";
import { startTrustedWriterRuntime } from "./trusted-writer-runtime.ts";
import type { TrustedMergeRequestHandler } from "./trusted-merge-request.ts";
import type { TrustedWriterRuntime } from "./trusted-writer-runtime.ts";

/**
 * Read a writer-owned secret through a no-follow file descriptor. Check the
 * opened inode, not a path that could be replaced between stat and read.
 */
export function readTrustedWriterCredential(secretFile: string): string {
  if (!isAbsolute(secretFile)) {
    throw new Error("Absolute credential file path required");
  }
  const fd = openSync(
    secretFile,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = fstatSync(fd);
    const uid = process.getuid?.();
    if (
      !info.isFile() ||
      uid === undefined ||
      info.uid !== uid ||
      (info.mode & 0o077) !== 0 ||
      info.size > 128
    ) {
      throw new Error("Writer credential must be a private writer-owned file");
    }
    const secret = readFileSync(fd, "utf8").trim();
    if (!/^[a-f0-9]{64}$/.test(secret)) {
      throw new Error(
        "Writer credential must contain 32 bytes of lowercase hex",
      );
    }
    return secret;
  } finally {
    closeSync(fd);
  }
}

/**
 * Compose authenticated IPC and the protected writer runtime.
 *
 * The trusted process must construct its own independently verified evidence
 * handler. This function does not grant cross-UID socket access or implement
 * the complete production service.
 */
export async function startAuthenticatedTrustedWriter(
  databasePath: string,
  socketPath: string,
  secretFile: string,
  trustedHandler: TrustedMergeRequestHandler,
): Promise<TrustedWriterRuntime> {
  const secret = readTrustedWriterCredential(secretFile);
  const handler = createAuthenticatedMergeHandler(secret, trustedHandler);
  return startTrustedWriterRuntime(databasePath, socketPath, handler);
}
