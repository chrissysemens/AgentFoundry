import { createConnection } from "node:net";

/**
 * Narrow IPC client. Credentials must come from trusted provisioning, never
 * from worker-selected merge fields. This does not grant cross-UID access:
 * deployment socket permissions and identity isolation are separate gates.
 */
export async function requestAuthenticatedMerge(
  socketPath: string,
  credential: string,
  timeoutMs = 5_000,
): Promise<unknown> {
  if (!socketPath.startsWith("/") || !/^[a-f0-9]{64}$/.test(credential)) {
    throw new Error("Invalid writer IPC client configuration");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error("Invalid writer IPC timeout");
  }
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let settled = false;
    let response = "";
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(timeoutMs, () => fail(new Error("Writer IPC timeout")));
    socket.on("connect", () => {
      socket.write(
        JSON.stringify({
          credential,
          request: { operation: "authorize-merge" },
        }) + "\n",
      );
    });
    socket.on("data", (chunk: Buffer) => {
      if (settled) return;
      response += chunk.toString("utf8");
      if (Buffer.byteLength(response) > 65_536) {
        fail(new Error("Writer IPC response too large"));
        return;
      }
      const newline = response.indexOf("\n");
      if (newline < 0) return;
      try {
        const message: unknown = JSON.parse(response.slice(0, newline));
        if (
          message === null ||
          typeof message !== "object" ||
          Array.isArray(message) ||
          !Object.hasOwn(message, "ok")
        ) {
          throw new Error("Malformed writer IPC response");
        }
        const result = message as Record<string, unknown>;
        if (result.ok !== true) {
          throw new Error("Writer rejected authorization request");
        }
        if (!Object.hasOwn(result, "state")) {
          throw new Error("Writer IPC response missing state");
        }
        settled = true;
        socket.end();
        resolve(result.state);
      } catch (error) {
        fail(error instanceof Error ? error : new Error("Invalid IPC response"));
      }
    });
    socket.on("error", fail);
    socket.on("end", () => {
      if (!settled) fail(new Error("Writer IPC closed without response"));
    });
  });
}
