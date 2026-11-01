import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  captureOwnedSocket,
  createIsolatedMergeSocketServer,
  removeOwnedSocket,
} from "../src/isolated-merge-ipc.ts";
import type { State } from "../src/domain.ts";

describe.skipIf(process.platform === "win32")(
  "trusted socket inode cleanup",
  () => {
    it("refuses to delete a replacement socket at the original path", async () => {
      const dir = mkdtempSync(join(tmpdir(), "foundry-socket-inode-"));
      const path = join(dir, "writer.sock");
      const moved = join(dir, "writer-moved.sock");
      const first = createIsolatedMergeSocketServer(
        path,
        async () => ({}) as State,
      );
      const second = createIsolatedMergeSocketServer(
        path,
        async () => ({}) as State,
      );
      try {
        await new Promise<void>((resolve) => first.listen(path, resolve));
        const owned = captureOwnedSocket(path);
        renameSync(path, moved);
        await new Promise<void>((resolve) => second.listen(path, resolve));
        expect(() => removeOwnedSocket(path, owned)).toThrow("replaced");
      } finally {
        await new Promise<void>((resolve) => first.close(() => resolve()));
        await new Promise<void>((resolve) => second.close(() => resolve()));
        rmSync(dir, { recursive: true, force: true });
      }
    });
  },
);
