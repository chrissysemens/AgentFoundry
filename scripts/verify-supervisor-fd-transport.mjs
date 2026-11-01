#!/usr/bin/env node
/**
 * Disposable Linux supervisor-passed FD transport experiment.
 * Usage: node scripts/verify-supervisor-fd-transport.mjs WRITER_UID WRITER_GID BROKER_UID BROKER_GID
 * Requires root, Node 24+, four positive IDs, and distinct non-root UIDs.
 * This is a transport probe, NOT an authenticated merge writer.
 */
import { spawn } from "node:child_process";
import {
  chmodSync,
  chownSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const raw = process.argv.slice(2);
if (
  process.platform !== "linux" ||
  process.getuid?.() !== 0 ||
  raw.length !== 4 ||
  raw.some((id) => !/^[1-9][0-9]*$/.test(id))
) {
  throw Error(
    "Root Linux required: WRITER_UID WRITER_GID BROKER_UID BROKER_GID",
  );
}
const [writerUid, writerGid, brokerUid, brokerGid] = raw.map(Number);
if (
  [writerUid, writerGid, brokerUid, brokerGid].some(
    (id) => !Number.isSafeInteger(id),
  ) ||
  writerUid === brokerUid
) {
  throw Error("Distinct writer and broker UIDs required");
}
const root = mkdtempSync(join(tmpdir(), "af-fd-probe-"));
const privateDir = join(root, "writer");
const socketPath = join(privateDir, "writer.sock");
let writer;
let connection;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function launch(source, uid, gid, args = [], extraStdio = []) {
  return spawn(
    process.execPath,
    ["--input-type=module", "-e", source, ...args],
    {
      uid,
      gid,
      stdio: ["ignore", "pipe", "pipe", ...extraStdio],
      env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent" },
    },
  );
}
async function finished(child, timeoutMs = 5000) {
  return await new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Error("Child timed out: " + stderr));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (signal || code !== 0)
        reject(Error("Child failed: " + code + " " + stderr));
      else resolve();
    });
  });
}
try {
  chmodSync(root, 0o711);
  mkdirSync(privateDir, { mode: 0o700 });
  chownSync(privateDir, writerUid, writerGid);
  chmodSync(privateDir, 0o700);
  const writerSource = `
    import { createServer } from "node:net";
    import { chmodSync } from "node:fs";
    const path = process.argv[1];
    const server = createServer((socket) => {
      let data = "";
      socket.setTimeout(3000, () => socket.destroy());
      socket.on("data", (chunk) => {
        data += chunk.toString();
        if (data.length > 128) return socket.destroy();
        if (data.includes("\\n")) {
          const ok = data === '{"operation":"ping"}\\n';
          socket.end(JSON.stringify({ ok }) + "\\n");
        }
      });
    });
    server.listen(path, () => chmodSync(path, 0o600));
  `;
  writer = launch(writerSource, writerUid, writerGid, [socketPath]);
  let writerError = "";
  writer.stderr.on("data", (chunk) => {
    writerError += chunk.toString();
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (writer.exitCode !== null) throw Error("Writer failed: " + writerError);
    try {
      const stat = lstatSync(socketPath);
      if (stat.isSocket() && (stat.mode & 0o777) === 0o600) {
        ready = true;
        break;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await wait(50);
  }
  if (!ready) throw Error("Writer socket not ready: " + writerError);

  // Broker cannot open the writer's private pathname.
  const directProbe = launch(
    `
    import { createConnection } from "node:net";
    const socket = createConnection(process.argv[1]);
    const timer = setTimeout(() => process.exit(9), 2000);
    socket.on("connect", () => { clearTimeout(timer); process.exit(8); });
    socket.on("error", (error) => {
      clearTimeout(timer);
      process.exit(["EACCES", "EPERM"].includes(error.code) ? 0 : 7);
    });
  `,
    brokerUid,
    brokerGid,
    [socketPath],
  );
  await finished(directProbe);

  // Privileged supervisor connects; only the connected socket descriptor is
  // inherited by the broker. The broker never receives the writer pathname
  // permissions or a database file descriptor.
  connection = createConnection(socketPath);
  await new Promise((resolve, reject) => {
    connection.once("connect", resolve);
    connection.once("error", reject);
  });
  const broker = launch(
    `
    import { Socket } from "node:net";
    const socket = new Socket({ fd: 3, readable: true, writable: true });
    let response = "";
    const timer = setTimeout(() => process.exit(9), 3000);
    socket.on("data", (chunk) => { response += chunk.toString(); });
    socket.on("end", () => {
      clearTimeout(timer);
      try {
        process.exit(JSON.parse(response).ok === true ? 0 : 8);
      } catch { process.exit(7); }
    });
    socket.on("error", () => { clearTimeout(timer); process.exit(6); });
    socket.write('{"operation":"ping"}\\n');
  `,
    brokerUid,
    brokerGid,
    [],
    [connection],
  );
  await finished(broker);
  console.log(
    "PASS: direct broker path denied; supervisor-passed connected FD worked",
  );
} finally {
  connection?.destroy();
  if (writer && writer.exitCode === null) writer.kill("SIGKILL");
  rmSync(root, { recursive: true, force: true });
}
