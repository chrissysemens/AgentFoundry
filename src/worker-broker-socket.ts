import { createServer, type Server } from "node:net";
import { chmodSync, lstatSync, unlinkSync } from "node:fs";
import type { Stats } from "node:fs";
import { dirname } from "node:path";

export interface WorkerBrokerSocket {
  server: Server;
  close(): Promise<void>;
}

/**
 * Worker-facing Linux Unix socket. Group access is NOT SO_PEERCRED
 * authentication; callers must also pass createWorkerBrokerHandler.
 */
export async function startWorkerBrokerSocket(
  socketPath: string,
  sharedGid: number,
  handler: (request: unknown) => Promise<unknown>,
): Promise<WorkerBrokerSocket> {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (
    process.platform !== "linux" ||
    uid === undefined ||
    gid === undefined ||
    uid === 0 ||
    gid === 0 ||
    process.geteuid?.() !== uid ||
    process.getegid?.() !== gid ||
    process.getgroups?.().includes(0)
  ) {
    throw new Error("Dedicated non-root Linux broker identity required");
  }
  if (
    !socketPath.startsWith("/") ||
    !Number.isSafeInteger(sharedGid) ||
    sharedGid <= 0 ||
    gid !== sharedGid ||
    typeof handler !== "function"
  ) {
    throw new Error("Invalid worker broker socket configuration");
  }
  const directory = lstatSync(dirname(socketPath));
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== uid ||
    directory.gid !== sharedGid ||
    (directory.mode & 0o7777) !== 0o710
  ) {
    throw new Error("Broker socket directory must be broker-owned mode 0710");
  }
  try {
    lstatSync(socketPath);
    throw new Error("Broker socket path already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const server = createServer((socket) => {
    let input = "";
    let complete = false;
    socket.setTimeout(5_000, () => socket.destroy());
    socket.on("data", (chunk: Buffer) => {
      if (complete) return;
      input += chunk.toString("utf8");
      if (Buffer.byteLength(input, "utf8") > 4_096) {
        complete = true;
        socket.end(
          JSON.stringify({ ok: false, error: "Request rejected" }) + "\n",
        );
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
            throw new Error("Broker response too large");
          }
          if (!socket.destroyed) socket.end(response);
        } catch {
          if (!socket.destroyed) {
            socket.end(
              JSON.stringify({ ok: false, error: "Request rejected" }) + "\n",
            );
          }
        }
      })();
    });
    socket.on("error", () => undefined);
  });
  server.maxConnections = 32;

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    chmodSync(socketPath, 0o660);
    const owned: Stats = lstatSync(socketPath);
    if (
      !owned.isSocket() ||
      owned.uid !== uid ||
      owned.gid !== sharedGid ||
      (owned.mode & 0o7777) !== 0o660
    ) {
      throw new Error("Broker socket ownership or permissions mismatch");
    }
    let closed = false;
    return {
      server,
      async close(): Promise<void> {
        if (closed) return;
        closed = true;
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        const current = lstatSync(socketPath);
        if (
          !current.isSocket() ||
          current.dev !== owned.dev ||
          current.ino !== owned.ino
        ) {
          throw new Error("Refusing to remove replaced broker socket");
        }
        unlinkSync(socketPath);
      },
    };
  } catch (error) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw error;
  }
}
