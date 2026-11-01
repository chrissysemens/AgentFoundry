import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startWorkerBrokerSocket } from "../src/worker-broker-socket.ts";
import { createWorkerBrokerHandler } from "../src/worker-broker-request.ts";

const runnable =
  process.platform === "linux" &&
  (process.getuid?.() ?? 0) !== 0 &&
  (process.getgid?.() ?? 0) !== 0 &&
  process.getuid?.() === process.geteuid?.() &&
  process.getgid?.() === process.getegid?.() &&
  !process.getgroups?.().includes(0);

describe.skipIf(!runnable)("worker-facing broker socket", () => {
  it("accepts the fixed request and rejects forged fields", async () => {
    const dir = mkdtempSync(join(tmpdir(), "af-broker-"));
    const socketPath = join(dir, "broker.sock");
    chmodSync(dir, 0o710);
    const credential = "a".repeat(64);
    const handler = createWorkerBrokerHandler(credential, async () => ({
      forwarded: true,
    }));
    let runtime:
      Awaited<ReturnType<typeof startWorkerBrokerSocket>> | undefined;
    const send = (request: unknown) =>
      new Promise<{ ok: boolean }>((resolve, reject) => {
        const client = createConnection(socketPath);
        let response = "";
        client.on("connect", () =>
          client.write(JSON.stringify(request) + "\n"),
        );
        client.on("data", (chunk: Buffer) => {
          response += chunk.toString("utf8");
        });
        client.on("end", () => resolve(JSON.parse(response)));
        client.on("error", reject);
      });
    try {
      runtime = await startWorkerBrokerSocket(
        socketPath,
        process.getgid!(),
        handler,
      );
      expect(statSync(socketPath).mode & 0o777).toBe(0o660);
      expect(
        (await send({ credential, operation: "authorize-merge" })).ok,
      ).toBe(true);
      expect(
        (
          await send({
            credential,
            operation: "authorize-merge",
            humanId: 99,
          })
        ).ok,
      ).toBe(false);
      expect(
        (
          await send({
            credential: "b".repeat(64),
            operation: "authorize-merge",
          })
        ).ok,
      ).toBe(false);
    } finally {
      await runtime?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects group mismatches before opening a socket", async () => {
    const dir = mkdtempSync(join(tmpdir(), "af-broker-group-"));
    chmodSync(dir, 0o710);
    try {
      await expect(
        startWorkerBrokerSocket(
          join(dir, "broker.sock"),
          process.getgid!() + 1,
          async () => ({}),
        ),
      ).rejects.toThrow("dedicated non-root group identity");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
