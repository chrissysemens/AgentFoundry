import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";
import { describe, expect, it } from "vitest";
import {
  assertSocketPathUnused,
  createIsolatedMergeSocketServer,
} from "../src/isolated-merge-ipc.ts";
import type { State } from "../src/domain.ts";

describe.skipIf(process.platform === "win32")(
  "isolated merge socket transport",
  () => {
    it("accepts one bounded request and rejects caller-selected fields through the handler", async () => {
      const dir = mkdtempSync(join(tmpdir(), "foundry-ipc-"));
      const path = join(dir, "writer.sock");
      const seen: unknown[] = [];
      const server = createIsolatedMergeSocketServer(path, async (request) => {
        seen.push(request);
        if (JSON.stringify(request) !== '{"operation":"authorize-merge"}')
          throw Error("invalid");
        return { ticket_id: "ticket" } as State;
      });
      try {
        assertSocketPathUnused(path);
        await new Promise<void>((resolve) => server.listen(path, resolve));
        expect(statSync(path).mode & 0o777).toBe(0o600);
        const send = (body: string) =>
          new Promise<string>((resolve, reject) => {
            const client = createConnection(path);
            let response = "";
            client.on("connect", () => client.write(body + "\n"));
            client.on("data", (chunk: Buffer) => {
              response += chunk.toString("utf8");
            });
            client.on("end", () => resolve(response));
            client.on("error", reject);
          });
        expect(
          JSON.parse(await send('{"operation":"authorize-merge"}')).ok,
        ).toBe(true);
        expect(
          JSON.parse(
            await send('{"operation":"authorize-merge","actor":"forged"}'),
          ).ok,
        ).toBe(false);
        expect(seen).toHaveLength(2);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("rejects oversized handler output", async () => {
      const dir = mkdtempSync(join(tmpdir(), "foundry-ipc-limits-"));
      const path = join(dir, "writer.sock");
      const server = createIsolatedMergeSocketServer(
        path,
        async () => ({ large: "x".repeat(70_000) }) as unknown as State,
      );
      try {
        expect(server.maxConnections).toBe(32);
        await new Promise<void>((resolve) => server.listen(path, resolve));
        const response = await new Promise<string>((resolve, reject) => {
          const client = createConnection(path);
          let received = "";
          client.on("connect", () => {
            client.write(
              JSON.stringify({ operation: "authorize-merge" }) + "\n",
            );
          });
          client.on("data", (chunk: Buffer) => {
            received += chunk.toString("utf8");
          });
          client.on("end", () => resolve(received));
          client.on("error", reject);
        });
        expect(Buffer.byteLength(response)).toBeLessThan(65_536);
        expect(JSON.parse(response).ok).toBe(false);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("refuses an existing socket path", async () => {
      const dir = mkdtempSync(join(tmpdir(), "foundry-ipc-existing-"));
      const path = join(dir, "writer.sock");
      const server = createIsolatedMergeSocketServer(
        path,
        async () => ({}) as State,
      );
      try {
        await new Promise<void>((resolve) => server.listen(path, resolve));
        expect(() => assertSocketPathUnused(path)).toThrow("already exists");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        rmSync(dir, { recursive: true, force: true });
      }
    });
  },
);
