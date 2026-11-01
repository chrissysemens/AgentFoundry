import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";
import { startWorkerBrokerSocket } from "../src/worker-broker-socket.js";
import { createWorkerBrokerHandler } from "../src/worker-broker-request.js";

const credential = "a".repeat(64);

function exchange(path: string, input: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    let output = "";
    socket.setTimeout(2_000, () => {
      socket.destroy();
      reject(new Error("Timed out"));
    });
    socket.on("connect", () => socket.write(JSON.stringify(input) + "\n"));
    socket.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    socket.on("end", () => {
      try {
        resolve(JSON.parse(output));
      } catch (error) {
        reject(error);
      }
    });
    socket.on("error", reject);
  });
}

describe("worker broker socket", () => {
  it("enforces non-root Linux identity", async () => {
    if (process.platform === "linux" && process.getuid?.() !== 0) return;
    await expect(
      startWorkerBrokerSocket(
        "/tmp/agent-foundry-unused.sock",
        1,
        async () => ({}),
      ),
    ).rejects.toThrow();
  });

  it.skipIf(process.platform !== "linux" || process.getuid?.() === 0)(
    "accepts authenticated fixed requests and rejects forged fields",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "af-broker-test-"));
      const dir = join(root, "public");
      const socketPath = join(dir, "broker.sock");
      mkdirSync(dir, { mode: 0o710 });
      chmodSync(dir, 0o710);
      let listener:
        | Awaited<ReturnType<typeof startWorkerBrokerSocket>>
        | undefined;
      try {
        listener = await startWorkerBrokerSocket(
          socketPath,
          process.getgid!(),
          createWorkerBrokerHandler(credential, async () => ({
            accepted: true,
          })),
        );
        await expect(
          exchange(socketPath, { credential, operation: "authorize-merge" }),
        ).resolves.toEqual({ ok: true, result: { accepted: true } });
        await expect(
          exchange(socketPath, {
            credential,
            operation: "authorize-merge",
            ticket: "forged",
          }),
        ).resolves.toEqual({ ok: false, error: "Request rejected" });
      } finally {
        await listener?.close();
        rmSync(root, { recursive: true, force: true });
      }
      expect(existsSync(socketPath)).toBe(false);
    },
  );
});
