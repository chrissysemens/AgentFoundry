import { createServer, type Server } from "node:net";
import { chmodSync, lstatSync, unlinkSync } from "node:fs";
import type { Stats } from "node:fs";
import type { TrustedMergeRequestHandler } from "./trusted-merge-request.ts";

/**
 * Unix-domain socket transport for a trusted merge writer.
 *
 * The socket directory must be owned and controlled by the deployment
 * administrator. Socket mode is defense in depth, not peer authentication.
 * Do not start this listener before separately enforcing peer identity and
 * database-directory isolation at the OS/container boundary.
 */
export function createIsolatedMergeSocketServer(
  socketPath: string,
  handler: TrustedMergeRequestHandler,
): Server {
  if (!socketPath.startsWith("/")) {
    throw new Error("Absolute Unix socket path required");
  }
  const server = createServer((socket) => {
    let input = "";
    let complete = false;
    socket.setTimeout(5_000, () => socket.destroy());
    socket.on("data", (chunk: Buffer) => {
      if (complete) return;
      input += chunk.toString("utf8");
      if (Buffer.byteLength(input) > 4096) {
        complete = true;
        socket.end(
          JSON.stringify({ ok: false, error: "Request too large" }) + "\n",
        );
        return;
      }
      const newline = input.indexOf("\n");
      if (newline < 0) return;
      complete = true;
      void (async () => {
        try {
          const request: unknown = JSON.parse(input.slice(0, newline));
          const state = await handler(request);
          socket.end(JSON.stringify({ ok: true, state }) + "\n");
        } catch {
          socket.end(
            JSON.stringify({ ok: false, error: "Request rejected" }) + "\n",
          );
        }
      })();
    });
    socket.on("error", () => undefined);
  });
  server.on("listening", () => {
    chmodSync(socketPath, 0o600);
  });
  return server;
}

/** Refuse to unlink pre-existing paths, including symlinks and sockets. */
export function assertSocketPathUnused(socketPath: string): void {
  try {
    lstatSync(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error("Socket path already exists; refusing to replace it");
}

/** Capture the exact socket inode after listen; never trust pathname alone. */
export function captureOwnedSocket(socketPath: string): Stats {
  const info = lstatSync(socketPath);
  if (!info.isSocket()) {
    throw new Error("Trusted writer listener did not create a socket");
  }
  return info;
}

/** Cleanup only the original socket inode after server.close(). */
export function removeOwnedSocket(socketPath: string, owned: Stats): void {
  const current = lstatSync(socketPath);
  if (
    !current.isSocket() ||
    current.dev !== owned.dev ||
    current.ino !== owned.ino
  ) {
    throw new Error("Refusing to unlink replaced socket path");
  }
  unlinkSync(socketPath);
}
