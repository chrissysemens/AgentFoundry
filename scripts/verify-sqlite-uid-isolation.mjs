#!/usr/bin/env node
/**
 * Destructive deployment-only negative test, run as root on disposable Linux.
 * Usage: node scripts/verify-sqlite-uid-isolation.mjs DB_PATH UNTRUSTED_UID UNTRUSTED_GID
 *
 * Uses explicit UID and GID, rather than assuming they are numerically equal.
 * Never run on the production journal. Does not grant production readiness.
 */
import { spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [rawPath, rawUid, rawGid] = process.argv.slice(2);
if (process.platform !== "linux" || process.getuid?.() !== 0) {
  throw Error("Run as root on a disposable Linux test host");
}
function positiveIdentity(value, name) {
  if (!/^[1-9][0-9]*$/.test(value ?? "")) {
    throw Error(`Positive ${name} required`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw Error(`Invalid ${name}`);
  return number;
}
if (!rawPath) {
  throw Error(
    "Usage: verify-sqlite-uid-isolation.mjs DB_PATH UNTRUSTED_UID UNTRUSTED_GID",
  );
}
const uid = positiveIdentity(rawUid, "untrusted UID");
const gid = positiveIdentity(rawGid, "untrusted GID");
const path = resolve(rawPath);
const db = lstatSync(path);
const dir = lstatSync(dirname(path));
if (!db.isFile() || !dir.isDirectory() || db.uid === uid || dir.uid === uid) {
  throw Error(
    "Require existing SQLite file and directory owned by a different UID",
  );
}
const script = `
import { DatabaseSync } from "node:sqlite";
import { openSync, closeSync, renameSync, unlinkSync, writeSync } from "node:fs";
const path = process.argv[1];
const outcomes = [];
function denied(name, action) {
  try { action(); outcomes.push(name + ": UNEXPECTED SUCCESS"); }
  catch (error) {
    const code = error?.code;
    if (code !== "EACCES" && code !== "EPERM" &&
        code !== "SQLITE_CANTOPEN" && code !== "SQLITE_READONLY") {
      outcomes.push(name + ": INCONCLUSIVE (" + String(code ?? "unknown") + ")");
    } else {
      outcomes.push(name + ": denied (" + code + ")");
    }
  }
}
denied("direct SQL insert", () => {
  const db = new DatabaseSync(path);
  try {
    db.prepare("INSERT INTO events(event_id,ticket_id,event_json) VALUES (?,?,?)")
      .run("untrusted-forgery", "ticket", JSON.stringify({
        event_id: "untrusted-forgery", ticket_id: "ticket",
        event_type: "MERGE_AUTHORIZED", actor: "human:forged",
        timestamp: new Date().toISOString(), payload: {},
      }));
  } finally { db.close(); }
});
denied("database write descriptor", () => {
  const fd = openSync(path, "r+"); closeSync(fd);
});
denied("database replace", () => renameSync(path, path + ".untrusted-rename"));
denied("database delete", () => unlinkSync(path));
for (const suffix of ["-wal", "-shm"]) {
  denied("write existing " + suffix, () => {
    const fd = openSync(path + suffix, "r+");
    try { writeSync(fd, Buffer.from([0])); } finally { closeSync(fd); }
  });
  denied("create " + suffix, () => {
    const fd = openSync(path + suffix, "wx"); closeSync(fd);
  });
}
denied("create sibling", () => {
  const fd = openSync(path + ".untrusted-create", "wx"); closeSync(fd);
});
for (const outcome of outcomes) console.log(outcome);
if (outcomes.some((line) => line.includes("UNEXPECTED SUCCESS") || line.includes("INCONCLUSIVE"))) process.exit(1);
`;
const result = spawnSync(
  process.execPath,
  ["--input-type=module", "-e", script, path],
  {
    uid,
    gid,
    encoding: "utf8",
    timeout: 15_000,
    env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent" },
  },
);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (
  result.error ||
  result.status !== 0 ||
  !result.stdout?.includes("direct SQL insert: denied") ||
  !result.stdout?.includes("database write descriptor: denied")
) {
  throw Error("Untrusted UID isolation test failed or could not run");
}
console.log("Untrusted UID denied SQLite and directory mutations");
