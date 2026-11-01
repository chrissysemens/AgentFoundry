import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertTrustedWriterFilesystem } from "../src/trusted-writer-filesystem.ts";

describe.skipIf(process.platform !== "linux" || process.getuid?.() === 0)(
  "trusted writer filesystem preflight",
  () => {
    it("accepts private, distinct writer-owned directories and rejects unsafe layouts", () => {
      const root = mkdtempSync(join(tmpdir(), "foundry-writer-"));
      const databaseDir = join(root, "db");
      const socketDir = join(root, "ipc");
      const database = join(databaseDir, "events.sqlite");
      const socket = join(socketDir, "writer.sock");
      try {
        mkdirSync(databaseDir, { mode: 0o700 });
        mkdirSync(socketDir, { mode: 0o700 });
        chmodSync(databaseDir, 0o700);
        chmodSync(socketDir, 0o700);
        writeFileSync(database, "", { mode: 0o600 });
        chmodSync(database, 0o600);
        expect(() => assertTrustedWriterFilesystem(database, socket)).not.toThrow();
        chmodSync(databaseDir, 0o777);
        expect(() => assertTrustedWriterFilesystem(database, socket)).toThrow(
          "Unsafe database directory",
        );
        chmodSync(databaseDir, 0o700);
        chmodSync(database, 0o644);
        expect(() => assertTrustedWriterFilesystem(database, socket)).toThrow(
          "Unsafe SQLite file",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  },
);
