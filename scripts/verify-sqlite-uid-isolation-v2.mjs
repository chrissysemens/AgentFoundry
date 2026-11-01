#!/usr/bin/env node
/**
 * Destructive deployment-only negative test. Run as root on disposable Linux.
 * Usage: node scripts/verify-sqlite-uid-isolation.mjs DB_PATH UNTRUSTED_UID UNTRUSTED_GID
 */
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

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
  throw Error("Usage: verify-sqlite-uid-isolation.mjs DB_PATH UNTRUSTED_UID UNTRUSTED_GID");
}
const uid = positiveIdentity(rawUid, "untrusted UID");
const gid = positiveIdentity(rawGid, "untrusted GID");
const path = resolve(rawPath);
const db = lstatSync(path);
const dir = lstatSync(dirname(path));
if (!db.isFile() || !dir.isDirectory() || db.uid === uid || dir.uid === uid) {
  throw Error("Require existing SQLite file and directory owned by a different UID");
}
const snapshot = (file) => {
  try {
    const info = lstatSync(file);
    return {
      mode: info.mode,
      uid: info.uid,
      gid: info.gid,
      ino: info.ino,
      size: info.size,
      sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
    };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};
const paths = [path, path + "-wal", path + "-shm", path + ".untrusted-rename", path + ".untrusted-create"];
const before = paths.map(snapshot);
const script = `
import { DatabaseSync } from "node:sqlite";
import { openSync, closeSync, renameSync, unlinkSync, writeSync, existsSync } from "node:fs";
const path = process.argv[1];
let failed = false;
function denied(name, action) {
  try {
    action();
    console.error(name + ": UNEXPECTED SUCCESS");
    failed = true;
  } catch (error) {
    const code = error?.code;
    if (code !== "EACCES" && code !== "EPERM" && code !== "SQLITE_CANTOPEN" && code !== "SQLITE_READONLY") {
      console.error(name + ": UNEXPECTED ERROR " + String(code ?? error));
      failed = true;
    } else {
      console.log(name + ": denied (" + code + ")");
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
  if (existsSync(path + suffix)) denied("write " + suffix, () => {
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
if (failed) process.exitCode = 1;
`;
const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, path], {
  uid,
  gid,
  encoding: "utf8",
  timeout: 15_000,
  env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent" },
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
const after = paths.map(snapshot);
if (JSON.stringify(before) !== JSON.stringify(after)) {
  throw Error("SQLite isolation test changed protected files or created artifacts");
}
if (result.error || result.status !== 0) {
  throw Error("Untrusted UID isolation test failed or could not run");
}
console.log("Untrusted UID denied SQLite and directory mutations; file snapshots unchanged");
