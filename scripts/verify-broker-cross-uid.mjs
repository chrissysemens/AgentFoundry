#!/usr/bin/env node
/**
 * Disposable Linux deployment probe. Run as root with Node 24+:
 * node scripts/verify-broker-cross-uid.mjs BROKER_UID SHARED_GID WORKER_UID OUTSIDER_UID OUTSIDER_GID
 * The identities must be pre-provisioned; this creates only temporary files.
 */
import { spawn } from "node:child_process";
import {
  chmodSync,
  chownSync,
  lstatSync,
  mkdtempSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const values = process.argv.slice(2).map(Number);
if (
  process.platform !== "linux" ||
  process.getuid?.() !== 0 ||
  values.length !== 5 ||
  values.some((value) => !Number.isSafeInteger(value) || value <= 0)
) {
  throw new Error(
    "Root Linux required: BROKER_UID SHARED_GID WORKER_UID OUTSIDER_UID OUTSIDER_GID",
  );
}
const [brokerUid, sharedGid, workerUid, outsiderUid, outsiderGid] = values;
if (
  new Set([brokerUid, workerUid, outsiderUid]).size !== 3 ||
  outsiderGid === sharedGid
) {
  throw new Error("Require three distinct non-root UIDs and outsider GID");
}
const root = mkdtempSync(join(tmpdir(), "af-cross-uid-broker-"));
const dir = join(root, "public");
const socketPath = join(dir, "broker.sock");
const moduleUrl = pathToFileURL(resolve("src/worker-broker-socket.ts")).href;
const handlerUrl = pathToFileURL(resolve("src/worker-broker-request.ts")).href;
const credential = "a".repeat(64);
let broker;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function child(source, uid, gid, args = []) {
  return spawn(
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
      env: { PATH: process.env.PATH ?? "/usr/bin" },
    },
  );
}
async function runProbe(uid, gid, payload, expectSuccess) {
  const code = `
    import { createConnection } from "node:net";
    const [socketPath, payload] = process.argv.slice(1);
    const socket = createConnection(socketPath);
    let response = "";
    const timeout = setTimeout(() => { console.error("timeout"); process.exit(8); }, 3000);
    socket.on("connect", () => socket.write(payload + "\\n"));
    socket.on("data", (data) => { response += data.toString(); });
    socket.on("end", () => {
      clearTimeout(timeout);
      try {
        const parsed = JSON.parse(response);
        process.exit(parsed.ok === true ? 0 : 4);
      } catch { process.exit(5); }
    });
    socket.on("error", (error) => {
      clearTimeout(timeout);
      process.exit(["EACCES", "EPERM"].includes(error.code) ? 13 : 6);
    });
  `;
  const processChild = child(code, uid, gid, [
    socketPath,
    JSON.stringify(payload),
  ]);
  const exitCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      processChild.kill("SIGKILL");
      reject(new Error("Probe timed out"));
    }, 5000);
    processChild.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    processChild.on("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  const expected = expectSuccess ? 0 : 13;
  if (exitCode !== expected) {
    throw new Error(
      `Cross-UID probe expected exit ${expected}, got ${exitCode}`,
    );
  }
}
try {
  chmodSync(root, 0o711);
  mkdirSync(dir, { mode: 0o710 });
  chownSync(dir, brokerUid, sharedGid);
  chmodSync(dir, 0o710);
  const source = `
    import { startWorkerBrokerSocket } from ${JSON.stringify(moduleUrl)};
    import { createWorkerBrokerHandler } from ${JSON.stringify(handlerUrl)};
    const handler = createWorkerBrokerHandler(${JSON.stringify(credential)}, async () => ({ accepted: true }));
    await startWorkerBrokerSocket(${JSON.stringify(socketPath)}, ${sharedGid}, handler);
    console.log("ready");
  `;
  broker = child(source, brokerUid, sharedGid);
  let stderr = "";
  broker.stderr.on("data", (data) => {
    stderr += data.toString();
  });
  for (let i = 0; i < 60; i++) {
    if (broker.exitCode !== null) throw new Error("Broker exited: " + stderr);
    try {
      if (lstatSync(socketPath).isSocket()) break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await sleep(50);
  }
  if (!lstatSync(socketPath).isSocket())
    throw new Error("Broker did not listen");
  await runProbe(
    workerUid,
    sharedGid,
    { credential, operation: "authorize-merge" },
    true,
  );
  await runProbe(
    outsiderUid,
    outsiderGid,
    { credential, operation: "authorize-merge" },
    false,
  );
  console.log("PASS: worker connected; outsider denied by OS permissions");
} finally {
  if (broker && broker.exitCode === null) broker.kill("SIGKILL");
  rmSync(root, { recursive: true, force: true });
}
