#!/usr/bin/env node
/**
 * Disposable Linux-only cross-UID fixture. Never point this at production data.
 * Run as root: node scripts/run-disposable-uid-isolation.mjs WRITER_UID WRITER_GID WORKER_UID WORKER_GID RESOLVER_UID RESOLVER_GID
 */
import { mkdtempSync, mkdirSync, chmodSync, chownSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

if (process.platform !== "linux" || process.getuid?.() !== 0) {
  throw Error("Disposable cross-UID fixture requires Linux root");
}
const args = process.argv.slice(2);
if (
  args.length !== 6 ||
  args.some(
    (value) =>
      !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)),
  )
) {
  throw Error("Supply six positive numeric UID/GID values");
}
const [writerUid, writerGid, workerUid, workerGid, resolverUid, resolverGid] =
  args.map(Number);
if (new Set([writerUid, workerUid, resolverUid]).size !== 3) {
  throw Error("Writer, worker and resolver UIDs must be distinct");
}
const root = mkdtempSync(join(tmpdir(), "agent-foundry-isolation-"));
const directory = join(root, "private");
const database = join(directory, "events.sqlite");
try {
  // Root is traversable, but the writer's database directory is not.
  chmodSync(root, 0o755);
  mkdirSync(directory, { mode: 0o700 });
  chownSync(directory, writerUid, writerGid);
  chmodSync(directory, 0o700);
  const setup = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync(process.argv[1]); db.exec("CREATE TABLE events(event_id TEXT PRIMARY KEY, ticket_id TEXT, event_json TEXT)"); db.close();',
      database,
    ],
    { uid: writerUid, gid: writerGid, encoding: "utf8", timeout: 15000 },
  );
  if (setup.status !== 0 || setup.error) {
    throw Error(
      "Writer fixture setup failed: " + (setup.stderr ?? setup.error),
    );
  }
  for (const [label, uid, gid] of [
    ["worker", workerUid, workerGid],
    ["resolver", resolverUid, resolverGid],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/verify-sqlite-uid-isolation.mjs",
        database,
        String(uid),
        String(gid),
      ],
      { encoding: "utf8", timeout: 20000 },
    );
    process.stdout.write(label + ":\n" + (result.stdout ?? ""));
    if (result.status !== 0 || result.error) {
      throw Error(
        label +
          " isolation verification failed: " +
          (result.stderr ?? result.error),
      );
    }
  }
  console.log(
    "Disposable UID isolation checks passed; deployment security is NOT proven.",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
