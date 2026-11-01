import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startAuthenticatedTrustedWriter } from "../src/authenticated-trusted-writer.ts";
import type { State } from "../src/domain.ts";

describe.skipIf(process.platform !== "linux" || process.getuid?.() === 0)(
  "authenticated trusted writer startup",
  () => {
    it("rejects credentials readable by other identities", async () => {
      const root = mkdtempSync(join(tmpdir(), "foundry-credential-"));
      const dbDir = join(root, "db");
      const ipcDir = join(root, "ipc");
      const db = join(dbDir, "events.sqlite");
      const socket = join(ipcDir, "writer.sock");
      const secretFile = join(root, "secret");
      try {
        mkdirSync(dbDir, { mode: 0o700 });
        mkdirSync(ipcDir, { mode: 0o700 });
        chmodSync(dbDir, 0o700);
        chmodSync(ipcDir, 0o700);
        writeFileSync(db, "", { mode: 0o600 });
        writeFileSync(secretFile, "a".repeat(64), { mode: 0o644 });
        chmodSync(db, 0o600);
        chmodSync(secretFile, 0o644);
        await expect(
          startAuthenticatedTrustedWriter(
            db,
            socket,
            secretFile,
            async () => ({}) as State,
          ),
        ).rejects.toThrow("private writer-owned file");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  },
);
