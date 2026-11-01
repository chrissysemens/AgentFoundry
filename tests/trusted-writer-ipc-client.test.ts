import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAuthenticatedMergeHandler } from "../src/authenticated-merge-ipc.ts";
import { createIsolatedMergeSocketServer } from "../src/isolated-merge-ipc.ts";
import { requestAuthenticatedMerge } from "../src/trusted-writer-ipc-client.ts";
import type { State } from "../src/domain.ts";

describe.skipIf(process.platform === "win32")(
  "authenticated writer IPC client",
  () => {
    it("sends only the fixed operation and accepts an authenticated response", async () => {
      const directory = mkdtempSync(join(tmpdir(), "foundry-auth-client-"));
      const path = join(directory, "writer.sock");
      const credential = "a".repeat(64);
      const seen: unknown[] = [];
      const server = createIsolatedMergeSocketServer(
        path,
        createAuthenticatedMergeHandler(credential, async (request) => {
          seen.push(request);
          return { ticket_id: "T1" } as State;
        }),
      );
      try {
        await new Promise<void>((resolve) => server.listen(path, resolve));
        expect(await requestAuthenticatedMerge(path, credential)).toEqual({
          ticket_id: "T1",
        });
        expect(seen).toEqual([{ operation: "authorize-merge" }]);
        await expect(
          requestAuthenticatedMerge(path, "b".repeat(64)),
        ).rejects.toThrow("rejected");
        expect(seen).toHaveLength(1);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        rmSync(directory, { recursive: true, force: true });
      }
    });

    it("rejects invalid credential and relative socket paths", async () => {
      await expect(
        requestAuthenticatedMerge("relative.sock", "a".repeat(64)),
      ).rejects.toThrow("configuration");
      await expect(
        requestAuthenticatedMerge("/tmp/test.sock", "not-a-secret"),
      ).rejects.toThrow("configuration");
    });
  },
);
