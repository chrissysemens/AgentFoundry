import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startTrustedWriterRuntime } from "../src/trusted-writer-runtime.ts";
import type { State } from "../src/domain.ts";

describe.skipIf(process.platform !== "linux" || process.getuid?.() === 0)(
  "trusted writer runtime",
  () => {
    it("starts only with private storage and serves bounded requests", async () => {
      const root = mkdtempSync(join(tmpdir(), "foundry-runtime-"));
      const dbDir = join(root, "db");
      const ipcDir = join(root, "ipc");
      const db = join(dbDir, "events.sqlite");
      const socket = join(ipcDir, "writer.sock");
      try {
        mkdirSync(dbDir, { mode: 0o700 });
        mkdirSync(ipcDir, { mode: 0o700 });
        chmodSync(dbDir, 0o700);
        chmodSync(ipcDir, 0o700);
        writeFileSync(db, "", { mode: 0o600 });
        chmodSync(db, 0o600);
        const runtime = await startTrustedWriterRuntime(
          db,
          socket,
          async () => ({ ticket_id: "ticket" }) as State,
        );
        try {
          const response = await new Promise<string>((resolve, reject) => {
            const client = createConnection(socket);
            let data = "";
            client.on("connect", () => {
              client.write('{"operation":"authorize-merge"}\n');
            });
            client.on("data", (chunk: Buffer) => {
              data += chunk.toString("utf8");
            });
            client.on("end", () => resolve(data));
            client.on("error", reject);
          });
          expect(JSON.parse(response).ok).toBe(true);
        } finally {
          await runtime.close();
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  },
);
