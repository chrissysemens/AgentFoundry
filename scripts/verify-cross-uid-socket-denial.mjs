#!/usr/bin/env node
/**
 * Destructive-environment deployment probe. Run as root on disposable Linux
 * with a live writer socket. Never run against production services.
 *
 * Usage: node scripts/verify-cross-uid-socket-denial.mjs SOCKET_PATH UID GID
 */
import { spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

const [socketPath, rawUid, rawGid] = process.argv.slice(2);
if (process.platform !== "linux" || process.getuid?.() !== 0) {
  throw Error("Run as root on disposable Linux");
}
function identity(value) {
  if (!/^[1-9][0-9]*$/.test(value ?? "")) {
    throw Error("Positive numeric UID and GID required");
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw Error("Invalid identity");
  return number;
}
const uid = identity(rawUid);
const gid = identity(rawGid);
if (!socketPath || !isAbsolute(socketPath)) {
  throw Error("Absolute socket path required");
}
const socket = lstatSync(socketPath);
const directory = lstatSync(dirname(socketPath));
if (
  !socket.isSocket() ||
  !directory.isDirectory() ||
  socket.uid === uid ||
  directory.uid === uid ||
  (socket.mode & 0o077) !== 0 ||
  (directory.mode & 0o077) !== 0
) {
  throw Error("Expected private writer-owned socket and directory");
}
const probe = `
import { createConnection } from "node:net";
const socket = createConnection(process.argv[1]);
const timeout = setTimeout(() => {
  console.error("INCONCLUSIVE: socket connection timed out");
  socket.destroy();
  process.exitCode = 1;
}, 3000);
socket.once("connect", () => {
  clearTimeout(timeout);
  console.error("FAIL: untrusted UID connected to private writer socket");
  socket.destroy();
  process.exitCode = 1;
});
socket.once("error", (error) => {
  clearTimeout(timeout);
  if (error.code === "EACCES" || error.code === "EPERM") {
    console.log("PASS: untrusted UID denied private writer socket");
  } else {
    console.error("INCONCLUSIVE: " + String(error.code ?? error.message));
    process.exitCode = 1;
  }
});
`;
const result = spawnSync(
  process.execPath,
  ["--input-type=module", "-e", probe, socketPath],
  {
    uid,
    gid,
    encoding: "utf8",
    timeout: 5000,
    env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent" },
  },
);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (
  result.error ||
  result.status !== 0 ||
  !result.stdout?.includes("PASS: untrusted UID denied private writer socket")
) {
  throw Error("Cross-UID socket denial not proven");
}
