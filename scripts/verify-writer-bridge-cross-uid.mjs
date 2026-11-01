#!/usr/bin/env node
/**
 * DESTRUCTIVE, opt-in Linux deployment fixture. Node 24+, root, disposable DB.
 * Usage: node scripts/verify-writer-bridge-cross-uid.mjs WRITER_UID BRIDGE_UID WORKER_UID OUTSIDER_UID BRIDGE_GID WORKER_GID OUTSIDER_GID
 * Never use production identities, credentials or journals.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  chownSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const raw = process.argv.slice(2);
if (
  process.platform !== "linux" ||
  process.getuid?.() !== 0 ||
  raw.length !== 7 ||
  raw.some((s) => !/^[1-9][0-9]*$/.test(s))
) {
  throw new Error(
    "Linux root and seven positive numeric UID/GID arguments required",
  );
}
const ids = raw.map(Number);
if (ids.some((n) => !Number.isSafeInteger(n)))
  throw new Error("Invalid identity");
const [
  writerUid,
  bridgeUid,
  workerUid,
  outsiderUid,
  bridgeGid,
  workerGid,
  outsiderGid,
] = ids;
if (
  new Set([writerUid, bridgeUid, workerUid, outsiderUid]).size !== 4 ||
  new Set([bridgeGid, workerGid, outsiderGid]).size !== 3 ||
  [writerUid, bridgeUid, workerUid, outsiderUid].some((n) =>
    ids.slice(4).includes(n),
  )
) {
  throw new Error(
    "Require four distinct UIDs and three distinct non-overlapping GIDs",
  );
}

const root = mkdtempSync(join(tmpdir(), "af-writer-bridge-"));
const dbDir = join(root, "db");
const stagedSource = join(root, "source");
const writerDir = join(root, "writer-ipc");
const bridgeDir = join(root, "bridge-ipc");
const secretDir = join(root, "bridge-secret");
const dbPath = join(dbDir, "events.sqlite");
const writerSocket = join(writerDir, "writer.sock");
const bridgeSocket = join(bridgeDir, "bridge.sock");
const secretPath = join(secretDir, "credential");
const credential = "b".repeat(64); // disposable test-only credential
const writerModule = pathToFileURL(
  join(stagedSource, "trusted-writer-runtime.ts"),
).href;
const authModule = pathToFileURL(
  join(stagedSource, "authenticated-merge-ipc.ts"),
).href;
const bridgeModule = pathToFileURL(
  join(stagedSource, "cross-uid-merge-bridge.ts"),
).href;
const children = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function spawnAs(source, uid, gid, args = []) {
  const child = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      source,
      ...args,
    ],
    {
      uid,
      gid,
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent" },
    },
  );
  let stderr = "";
  child.stderr.on("data", (data) => {
    stderr += data.toString();
  });
  child.on("error", (error) => {
    stderr += String(error);
  });
  children.push(child);
  return {
    child,
    get stderr() {
      return stderr;
    },
  };
}
async function ready(proc, path) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (proc.child.exitCode !== null || proc.child.signalCode !== null) {
      throw new Error("Service exited before readiness: " + proc.stderr);
    }
    try {
      const socket = lstatSync(path);
      if (socket.isSocket() && (socket.mode & 0o7777) === 0o660) return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await pause(50);
  }
  throw new Error("Service socket never appeared: " + path + " " + proc.stderr);
}
function probe(
  uid,
  gid,
  socket,
  expected,
  payload = { operation: "authorize-merge" },
) {
  const source = `
    import { createConnection } from "node:net";
    const [path, payload] = process.argv.slice(1);
    const client = createConnection(path);
    let data = "";
    const timeout = setTimeout(() => process.exit(9), 4000);
    client.on("connect", () => client.write(payload + "\\n"));
    client.on("data", (chunk) => { data += chunk.toString(); });
    client.on("end", () => {
      clearTimeout(timeout);
      try {
        const response = JSON.parse(data.trim());
        process.exit(response.ok === true && response.state?.ticket_id === "fixture" ? 0 : 8);
      } catch { process.exit(7); }
    });
    client.on("error", (error) => {
      clearTimeout(timeout);
      process.exit(["EACCES", "EPERM"].includes(error.code) ? 13 : 6);
    });
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", source, socket, JSON.stringify(payload)],
    {
      uid,
      gid,
      encoding: "utf8",
      timeout: 7000,
      env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent" },
    },
  );
  if (result.error || result.status !== expected) {
    throw new Error(
      "Socket probe expected " +
        expected +
        ", got " +
        result.status +
        ": " +
        (result.stderr ?? result.error),
    );
  }
}
function denySecretRead(uid, gid) {
  const source = `
    import { readFileSync } from "node:fs";
    try {
      readFileSync(process.argv[1], "utf8");
      process.exit(10);
    } catch (error) {
      process.exit(["EACCES", "EPERM"].includes(error.code) ? 0 : 11);
    }
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", source, secretPath],
    {
      uid,
      gid,
      encoding: "utf8",
      timeout: 7000,
      env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent" },
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error("Secret read was not conclusively denied for UID " + uid);
  }
}
function negativeSql(uid, gid) {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/verify-sqlite-uid-isolation.mjs",
      dbPath,
      String(uid),
      String(gid),
    ],
    {
      encoding: "utf8",
      timeout: 20000,
      env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent" },
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      "SQLite isolation failed: " + result.stdout + result.stderr,
    );
  }
}

try {
  chmodSync(root, 0o711);
  // Source checkout permissions are runner-specific. Stage only the application
  // modules in a disposable, root-owned read-only tree traversable by test UIDs.
  cpSync(resolve("src"), stagedSource, { recursive: true });
  function makeSourceReadable(directory) {
    chmodSync(directory, 0o755);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error("Refusing symlink in staged source: " + path);
      }
      if (entry.isDirectory()) makeSourceReadable(path);
      else if (entry.isFile()) chmodSync(path, 0o644);
      else throw new Error("Unexpected source entry: " + path);
    }
  }
  makeSourceReadable(stagedSource);
  for (const [path, uid, gid, mode] of [
    [dbDir, writerUid, bridgeGid, 0o700],
    [writerDir, writerUid, bridgeGid, 0o710],
    [bridgeDir, bridgeUid, workerGid, 0o710],
    [secretDir, bridgeUid, bridgeGid, 0o700],
  ]) {
    mkdirSync(path, { mode });
    chownSync(path, uid, gid);
    chmodSync(path, mode);
  }
  const db = new DatabaseSync(dbPath);
  db.exec(
    "CREATE TABLE events (event_id TEXT, ticket_id TEXT, event_json TEXT)",
  );
  db.close();
  chownSync(dbPath, writerUid, bridgeGid);
  chmodSync(dbPath, 0o600);
  for (const suffix of ["-wal", "-shm"]) {
    writeFileSync(dbPath + suffix, "", { mode: 0o600 });
    chownSync(dbPath + suffix, writerUid, bridgeGid);
    chmodSync(dbPath + suffix, 0o600);
  }
  writeFileSync(secretPath, credential, { mode: 0o600 });
  chownSync(secretPath, bridgeUid, bridgeGid);
  chmodSync(secretPath, 0o600);

  // The fixture uses a fixed response, NOT a real human-evidence authorization.
  const writerSource = `
    import { startTrustedWriterRuntime } from ${JSON.stringify(writerModule)};
    import { createAuthenticatedMergeHandler } from ${JSON.stringify(authModule)};
    const handler = createAuthenticatedMergeHandler(${JSON.stringify(credential)}, async () => ({ ticket_id: "fixture" }));
    await startTrustedWriterRuntime(${JSON.stringify(dbPath)}, ${JSON.stringify(writerSocket)}, handler, ${bridgeGid});
    console.log("ready");
  `;
  const writer = spawnAs(writerSource, writerUid, bridgeGid);
  await ready(writer, writerSocket);

  const bridgeSource = `
    import { readFileSync } from "node:fs";
    import { startCrossUidMergeBridge } from ${JSON.stringify(bridgeModule)};
    const credential = readFileSync(${JSON.stringify(secretPath)}, "utf8").trim();
    await startCrossUidMergeBridge(${JSON.stringify(bridgeSocket)}, ${JSON.stringify(writerSocket)}, credential, ${workerGid});
    console.log("ready");
  `;
  // Bridge needs both groups: writer IPC and worker-facing socket.
  // setpriv is a fixture-only util-linux dependency; fail if unavailable.
  const setpriv = spawnSync("setpriv", ["--version"], { encoding: "utf8" });
  if (setpriv.error || setpriv.status !== 0) {
    throw new Error(
      "util-linux setpriv is required for supplementary group fixture",
    );
  }
  const bridgeChild = spawn(
    "setpriv",
    [
      "--reuid",
      String(bridgeUid),
      "--regid",
      String(workerGid),
      "--groups",
      String(bridgeGid) + "," + String(workerGid),
      process.execPath,
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      bridgeSource,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent" },
    },
  );
  let bridgeStderr = "";
  bridgeChild.stderr.on("data", (data) => {
    bridgeStderr += data.toString();
  });
  bridgeChild.on("error", (error) => {
    bridgeStderr += String(error);
  });
  children.push(bridgeChild);
  const bridge = {
    child: bridgeChild,
    get stderr() {
      return bridgeStderr;
    },
  };
  await ready(bridge, bridgeSocket);

  // Positive path: distinct worker UID -> bridge -> distinct writer UID.
  probe(workerUid, workerGid, bridgeSocket, 0);
  // Worker-controlled fields and unknown operations must never reach the writer.
  probe(workerUid, workerGid, bridgeSocket, 8, {
    operation: "authorize-merge",
    credential,
  });
  probe(workerUid, workerGid, bridgeSocket, 8, {
    operation: "arbitrary-writer-operation",
  });
  // The worker cannot reach the writer's private group-scoped socket.
  probe(workerUid, workerGid, writerSocket, 13);
  // An outsider cannot reach the worker-facing bridge socket.
  probe(outsiderUid, outsiderGid, bridgeSocket, 13);
  // Neither untrusted identity can mutate the journal or its directory.
  negativeSql(bridgeUid, workerGid);
  negativeSql(workerUid, workerGid);
  denySecretRead(workerUid, workerGid);
  denySecretRead(outsiderUid, outsiderGid);
  console.log(
    "PASS: worker->bridge->writer; denied unauthorized IPC, SQLite mutation and credential reads",
  );
  console.log(
    "NOT PROVEN: human evidence, hostile bridge behavior, credential secrecy, restart/race resistance",
  );
} finally {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
  rmSync(root, { recursive: true, force: true });
}
