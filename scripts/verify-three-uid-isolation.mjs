#!/usr/bin/env node
/**
 * Destructive, root-only Linux deployment gate for a disposable writer DB.
 * Usage:
 * node scripts/verify-three-uid-isolation.mjs DB_PATH WRITER_UID BROKER_UID BROKER_GID WORKER_UID SHARED_GID OUTSIDER_UID OUTSIDER_GID
 *
 * Runs both existing SQLite negative probes and the worker-facing socket
 * positive/negative probe. Does NOT exercise broker-to-writer IPC.
 */
import { spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [rawDb, ...rawIds] = process.argv.slice(2);
if (
  process.platform !== "linux" ||
  process.getuid?.() !== 0 ||
  !rawDb ||
  rawIds.length !== 7 ||
  rawIds.some((id) => !/^[1-9][0-9]*$/.test(id))
) {
  throw new Error(
    "Root Linux required: DB_PATH WRITER_UID BROKER_UID BROKER_GID WORKER_UID SHARED_GID OUTSIDER_UID OUTSIDER_GID",
  );
}
const ids = rawIds.map(Number);
if (ids.some((id) => !Number.isSafeInteger(id))) {
  throw new Error("Invalid Linux identity");
}
const [
  writerUid,
  brokerUid,
  brokerGid,
  workerUid,
  sharedGid,
  outsiderUid,
  outsiderGid,
] = ids;
if (
  new Set([writerUid, brokerUid, workerUid, outsiderUid]).size !== 4 ||
  brokerGid !== sharedGid ||
  outsiderGid === sharedGid
) {
  throw new Error("Distinct UIDs and broker/worker shared GID required");
}
const databasePath = resolve(rawDb);
const db = lstatSync(databasePath);
const parent = lstatSync(dirname(databasePath));
if (
  !db.isFile() ||
  db.isSymbolicLink() ||
  !parent.isDirectory() ||
  parent.isSymbolicLink() ||
  db.uid !== writerUid ||
  parent.uid !== writerUid ||
  (db.mode & 0o077) !== 0 ||
  (parent.mode & 0o077) !== 0
) {
  throw new Error("Disposable DB and parent must be writer-owned and private");
}
const run = (name, script, args) => {
  console.log(`RUN: ${name}`);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: resolve("."),
    encoding: "utf8",
    timeout: 30_000,
    env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent" },
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error || result.status !== 0) {
    throw new Error(`${name} FAILED or INCONCLUSIVE`);
  }
  console.log(`PASS: ${name}`);
};
run(
  "broker cannot mutate writer SQLite",
  "scripts/verify-sqlite-uid-isolation.mjs",
  [databasePath, String(brokerUid), String(brokerGid)],
);
run(
  "worker cannot mutate writer SQLite",
  "scripts/verify-sqlite-uid-isolation.mjs",
  [databasePath, String(workerUid), String(sharedGid)],
);
run(
  "worker allowed; outsider denied broker socket",
  "scripts/verify-broker-cross-uid.mjs",
  [
    String(brokerUid),
    String(sharedGid),
    String(workerUid),
    String(outsiderUid),
    String(outsiderGid),
  ],
);
console.log(
  "PASS: scoped three-UID isolation checks; broker-to-writer IPC NOT TESTED",
);
