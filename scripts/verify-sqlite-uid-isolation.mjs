#!/usr/bin/env node
/**
 * Deployment-only negative test. Run as root on a disposable Linux test host.
 * Usage: node scripts/verify-sqlite-uid-isolation.mjs DB_PATH UNTRUSTED_UID
 *
 * The database must already exist and be owned by the trusted writer identity.
 * This script NEVER writes as root. It drops credentials in the child before
 * opening SQLite, and fails if an untrusted UID can modify the database.
 */
import { spawnSync } from "node:child_process";
import { lstatSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [rawPath, rawUid] = process.argv.slice(2);
if (process.platform !== "linux" || process.getuid?.() !== 0) {
  throw Error("Run as root on a disposable Linux test host");
}
if (!rawPath || !/^(0|[1-9][0-9]*)$/.test(rawUid ?? "")) {
  throw Error(
    "Usage: node verify-sqlite-uid-isolation.mjs DB_PATH UNTRUSTED_UID",
  );
}
const uid = Number(rawUid);
if (!Number.isSafeInteger(uid) || uid === 0) {
  throw Error("Untrusted UID must be a non-root integer");
}
const path = resolve(rawPath);
if (!lstatSync(path).isFile() || !statSync(dirname(path)).isDirectory()) {
  throw Error("Existing regular SQLite file and directory required");
}
const script = `
import { DatabaseSync } from "node:sqlite";
import { renameSync, unlinkSync, openSync, closeSync } from "node:fs";
const path = process.argv[1];
const outcomes = [];
function denied(name, action) {
  try { action(); outcomes.push(name + ": UNEXPECTED SUCCESS"); }
  catch { outcomes.push(name + ": denied"); }
}
denied("direct insert", () => {
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
denied("database replace", () => renameSync(path, path + ".untrusted-rename"));
denied("database delete", () => unlinkSync(path));
for (const suffix of ["-wal", "-shm", ".untrusted-create"]) {
  denied("create " + suffix, () => {
    const fd = openSync(path + suffix, "wx");
    closeSync(fd);
  });
}
for (const outcome of outcomes) console.log(outcome);
if (outcomes.some((line) => line.includes("UNEXPECTED SUCCESS"))) process.exit(1);
`;
const result = spawnSync(
  process.execPath,
  ["--input-type=module", "-e", script, path],
  {
    uid,
    gid: uid,
    encoding: "utf8",
    timeout: 15_000,
    env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent" },
  },
);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error || result.status !== 0) {
  throw Error("Untrusted UID isolation test failed or could not run");
}
console.log("Untrusted UID denied SQLite and directory mutations");
