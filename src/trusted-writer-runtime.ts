import type { Server } from "node:net";
import {
  assertSocketPathUnused,
  captureOwnedSocket,
  createIsolatedMergeSocketServer,
  removeOwnedSocket,
} from "./isolated-merge-ipc.ts";
import { assertTrustedWriterFilesystem } from "./trusted-writer-filesystem.ts";
import type { TrustedMergeRequestHandler } from "./trusted-merge-request.ts";

export interface TrustedWriterRuntime {
  readonly server: Server;
  close(): Promise<void>;
}

/**
 * Start the trusted writer transport only after checking the protected
 * filesystem layout. The handler MUST be composed from independently verified
 * evidence inside the trusted process; never accept a worker-provided handler.
 *
 * This is not a complete production deployment: peer identity, service
 * provisioning, and cross-UID mount isolation must be independently enforced.
 */
export async function startTrustedWriterRuntime(
  databasePath: string,
  socketPath: string,
  handler: TrustedMergeRequestHandler,
): Promise<TrustedWriterRuntime> {
  assertTrustedWriterFilesystem(databasePath, socketPath);
  assertSocketPathUnused(socketPath);
  const server = createIsolatedMergeSocketServer(socketPath, handler);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    throw error;
  }
  const ownedSocket = captureOwnedSocket(socketPath);
  let closed = false;
  return {
    server,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      // Node normally removes its Unix socket on close. Only remove a
      // remaining socket inode; never remove a replaced regular file.
      try {
        removeOwnedSocket(socketPath, ownedSocket);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}
