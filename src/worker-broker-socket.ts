import { chmodSync, lstatSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { dirname, isAbsolute } from "node:path";
import {
  assertSocketPathUnused,
  captureOwnedSocket,
  removeOwnedSocket,
} from "./isolated-merge-ipc.ts";

/**
 * Linux worker-facing broker socket, separate from the writer's private
 * socket. A dedicated shared GID grants access; the worker must not belong
 * to the writer's group. Bearer authentication is still required by handler.
 *
 * Does not establish SO_PEERCRED identity or broker-to-writer transport.
 */
export async function startWorkerBrokerSocket(
  socketPath: string,
  sharedGid: number,
  handler: (request: unknown) => Promise<unknown>,
): Promise<{ server: Server; close(): Promise<void> }> {
  if (
    process.platform !== "linux" ||
    !isAbsolute(socketPath) ||
    !Number.isSafeInteger(sharedGid) ||
    sharedGid <= 0
  ) {
    throw new Error("Linux absolute socket path and dedicated group required");
  }
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (
    uid === undefined ||
    gid === undefined ||
    uid === 0 ||
    gid === 0 ||
    process.geteuid?.() !== uid ||
    process.getegid?.() !== gid ||
    process.getgroups?.().includes(0) ||
    gid !== sharedGid
  ) {
    throw new Error("Broker must run as dedicated non-root group identity");
  }
  const directory = lstatSync(dirname(socketPath));
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== uid ||
    directory.gid !== sharedGid ||
    (directory.mode & 0o777) !== 0o710
  ) {
    throw new Error("Broker socket directory must be broker-owned 0710");
  }
  assertSocketPathUnused(socketPath);
  const server = createServer((socket) => {
    let input = "";
    let complete = false;
    socket.setTimeout(5_000, () => socket.destroy());
    socket.on("data", (chunk: Buffer) => {
      if (complete) return;
      input += chunk.toString("utf8");
      if (Buffer.byteLength(input, "utf8") > 4096) {
        complete = true;
        socket.end('{"ok":false,"error":"Request rejected"}\n');
        return;
      }
      const newline = input.indexOf("\n");
      if (newline < 0) return;
      complete = true;
      void (async () => {
        try {
          const request: unknown = JSON.parse(input.slice(0, newline));
          const result = await handler(request);
          const response = JSON.stringify({ ok: true, result }) + "\n";
          if (Buffer.byteLength(response, "utf8") > 65_536) {
            throw new Error("Oversized broker response");
          }
          if (!socket.destroyed) socket.end(response);
        } catch {
          if (!socket.destroyed) {
            socket.end('{"ok":false,"error":"Request rejected"}\n');
          }
        }
      })();
    });
    socket.on("error", () => undefined);
  });
  server.maxConnections = 32;
  server.on("listening", () => chmodSync(socketPath, 0o660));
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    const socket = lstatSync(socketPath);
    if (
      !socket.isSocket() ||
      socket.uid !== uid ||
      socket.gid !== sharedGid ||
      (socket.mode & 0o777) !== 0o660
    ) {
      throw new Error("Broker socket ownership or permissions incorrect");
    }
  } catch (error) {
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    throw error;
  }
  const owned = captureOwnedSocket(socketPath);
  let closed = false;
  return {
    server,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      try {
        removeOwnedSocket(socketPath, owned);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}
