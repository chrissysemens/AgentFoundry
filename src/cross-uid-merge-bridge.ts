import { chmodSync, chownSync, lstatSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { isAbsolute } from "node:path";
import { requestAuthenticatedMerge } from "./trusted-writer-ipc-client.ts";
import {
  assertSocketPathUnused,
  captureOwnedSocket,
  removeOwnedSocket,
} from "./isolated-merge-ipc.ts";

/**
 * Narrow cross-UID bridge: run under a trusted, non-root identity that can
 * reach the writer's private socket and read its independently provisioned
 * credential. Never run this process under the worker identity.
 *
 * Worker-visible directory: trusted UID, worker GID, mode 0710.
 * Worker-visible socket: trusted UID, worker GID, mode 0660.
 * The bridge does not accept credentials or authorization fields from workers.
 */
export async function startCrossUidMergeBridge(
  publicSocket: string,
  privateSocket: string,
  credential: string,
  workerGid: number,
): Promise<{ server: Server; close(): Promise<void> }> {
  const uid = process.getuid?.();
  if (
    process.platform !== "linux" ||
    uid === undefined ||
    uid === 0 ||
    !Number.isSafeInteger(workerGid) ||
    workerGid <= 0 ||
    !process.getgroups?.().includes(workerGid) ||
    !isAbsolute(publicSocket) ||
    !isAbsolute(privateSocket) ||
    publicSocket === privateSocket ||
    !/^[a-f0-9]{64}$/.test(credential)
  ) {
    throw new Error("Unsafe cross-UID bridge configuration");
  }
  const directory = publicSocket.slice(0, publicSocket.lastIndexOf("/")) || "/";
  const info = lstatSync(directory);
  if (
    !info.isDirectory() ||
    info.uid !== uid ||
    info.gid !== workerGid ||
    (info.mode & 0o777) !== 0o710
  ) {
    throw new Error(
      "Bridge directory must be trusted-owned mode 0710 with worker group",
    );
  }
  assertSocketPathUnused(publicSocket);
  const server = createServer((socket) => {
    let input = "";
    let done = false;
    socket.setTimeout(5_000, () => socket.destroy());
    socket.on("data", (chunk: Buffer) => {
      if (done) return;
      input += chunk.toString("utf8");
      if (Buffer.byteLength(input) > 256) {
        done = true;
        socket.end('{"ok":false,"error":"Request rejected"}\n');
        return;
      }
      const newline = input.indexOf("\n");
      if (newline < 0) return;
      done = true;
      void (async () => {
        try {
          const request: unknown = JSON.parse(input.slice(0, newline));
          if (
            request === null ||
            typeof request !== "object" ||
            Array.isArray(request) ||
            Object.keys(request).length !== 1 ||
            (request as { operation?: unknown }).operation !== "authorize-merge"
          ) {
            throw new Error("Invalid bridge request");
          }
          const state = await requestAuthenticatedMerge(
            privateSocket,
            credential,
          );
          socket.end(JSON.stringify({ ok: true, state }) + "\n");
        } catch {
          socket.end('{"ok":false,"error":"Request rejected"}\n');
        }
      })();
    });
    socket.on("error", () => undefined);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(publicSocket, () => {
        server.off("error", reject);
        resolve();
      });
    });
    chownSync(publicSocket, uid, workerGid);
    chmodSync(publicSocket, 0o660);
    const owned = captureOwnedSocket(publicSocket);
    return {
      server,
      async close() {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        try {
          removeOwnedSocket(publicSocket, owned);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      },
    };
  } catch (error) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw error;
  }
}
