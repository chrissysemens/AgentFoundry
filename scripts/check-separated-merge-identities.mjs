#!/usr/bin/env node
/**
 * Read-only deployment preflight for a separately-identified writer and bridge.
 * Usage: node scripts/check-separated-merge-identities.mjs DB WRITER_SOCKET BRIDGE_SOCKET BRIDGE_SECRET WRITER_UID BRIDGE_UID WORKER_UID BRIDGE_GID WORKER_GID
 * Run after sockets are bound, before allowing worker requests.
 * This is a layout check, not an end-to-end cross-UID proof.
 */
import { lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function checkSeparatedMergeIdentities(paths, ids, stat = lstatSync) {
  const { database, writerSocket, bridgeSocket, bridgeSecret } = paths;
  const { writerUid, bridgeUid, workerUid, bridgeGid, workerGid } = ids;
  const values = [writerUid, bridgeUid, workerUid, bridgeGid, workerGid];
  if (
    process.platform !== "linux" ||
    values.some((n) => !Number.isSafeInteger(n) || n <= 0) ||
    new Set([writerUid, bridgeUid, workerUid]).size !== 3 ||
    bridgeGid === workerGid
  ) {
    throw new Error(
      "Distinct non-root writer, bridge and worker identities required",
    );
  }
  const files = [database, writerSocket, bridgeSocket, bridgeSecret];
  if (files.some((p) => typeof p !== "string" || !p.startsWith("/"))) {
    throw new Error("Absolute paths required");
  }
  const canonical = files.map((p) => resolve(p));
  if (new Set(canonical).size !== canonical.length) {
    throw new Error("Deployment endpoints must be distinct");
  }
  const check = (path, kind, uid, gid, mode) => {
    const info = stat(path);
    if (
      info.isSymbolicLink() ||
      !(kind === "file"
        ? info.isFile()
        : kind === "socket"
          ? info.isSocket()
          : info.isDirectory()) ||
      info.uid !== uid ||
      (gid !== null && info.gid !== gid) ||
      (info.mode & 0o7777) !== mode
    ) {
      throw new Error("Unsafe " + kind + " layout: " + path);
    }
  };
  check(database, "file", writerUid, null, 0o600);
  check(dirname(database), "directory", writerUid, null, 0o700);
  check(writerSocket, "socket", writerUid, bridgeGid, 0o660);
  check(dirname(writerSocket), "directory", writerUid, bridgeGid, 0o710);
  check(bridgeSocket, "socket", bridgeUid, workerGid, 0o660);
  check(dirname(bridgeSocket), "directory", bridgeUid, workerGid, 0o710);
  check(bridgeSecret, "file", bridgeUid, null, 0o600);
  return true;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === new URL(import.meta.url).pathname
) {
  const [database, writerSocket, bridgeSocket, bridgeSecret, ...rawIds] =
    process.argv.slice(2);
  if (rawIds.length !== 5 || rawIds.some((s) => !/^[1-9][0-9]*$/.test(s))) {
    throw new Error(
      "Usage: DB WRITER_SOCKET BRIDGE_SOCKET BRIDGE_SECRET WRITER_UID BRIDGE_UID WORKER_UID BRIDGE_GID WORKER_GID",
    );
  }
  const [writerUid, bridgeUid, workerUid, bridgeGid, workerGid] =
    rawIds.map(Number);
  checkSeparatedMergeIdentities(
    { database, writerSocket, bridgeSocket, bridgeSecret },
    { writerUid, bridgeUid, workerUid, bridgeGid, workerGid },
  );
  console.log(
    "PASS: separated writer/bridge/worker filesystem layout (not runtime isolation)",
  );
}
