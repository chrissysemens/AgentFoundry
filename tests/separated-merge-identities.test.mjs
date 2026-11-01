import { describe, expect, it } from "vitest";
import { checkSeparatedMergeIdentities } from "../scripts/check-separated-merge-identities.mjs";

const paths = {
  database: "/private/db/journal.sqlite",
  writerSocket: "/writer-ipc/writer.sock",
  bridgeSocket: "/bridge-public/bridge.sock",
  bridgeSecret: "/bridge-private/credential",
};
const ids = {
  writerUid: 1101,
  bridgeUid: 1102,
  workerUid: 1103,
  bridgeGid: 1201,
  workerGid: 1202,
};
function inode(kind, uid, gid, mode) {
  return {
    uid,
    gid,
    mode,
    isFile: () => kind === "file",
    isSocket: () => kind === "socket",
    isDirectory: () => kind === "directory",
    isSymbolicLink: () => false,
  };
}
const layout = {
  "/private/db/journal.sqlite": inode("file", 1101, 1101, 0o600),
  "/private/db": inode("directory", 1101, 1101, 0o700),
  "/writer-ipc/writer.sock": inode("socket", 1101, 1201, 0o660),
  "/writer-ipc": inode("directory", 1101, 1201, 0o710),
  "/bridge-public/bridge.sock": inode("socket", 1102, 1202, 0o660),
  "/bridge-public": inode("directory", 1102, 1202, 0o710),
  "/bridge-private/credential": inode("file", 1102, 1102, 0o600),
};
const stat = (p) => {
  const info = layout[p];
  if (!info) throw new Error("Unknown fixture path");
  return info;
};

describe.skipIf(process.platform !== "linux")("separated merge identities preflight", () => {
  it("accepts a strictly separated layout", () => {
    expect(checkSeparatedMergeIdentities(paths, ids, stat)).toBe(true);
  });
  it("rejects a bridge sharing the writer UID", () => {
    expect(() => checkSeparatedMergeIdentities(paths, { ...ids, bridgeUid: ids.writerUid }, stat)).toThrow();
  });
  it("rejects a worker sharing the bridge UID", () => {
    expect(() => checkSeparatedMergeIdentities(paths, { ...ids, workerUid: ids.bridgeUid }, stat)).toThrow();
  });
  it("rejects a writer socket in a private 0700 directory", () => {
    const badStat = (p) => p === "/writer-ipc" ? inode("directory", 1101, 1201, 0o700) : stat(p);
    expect(() => checkSeparatedMergeIdentities(paths, ids, badStat)).toThrow();
  });
  it("rejects world-accessible bridge sockets", () => {
    const badStat = (p) => p === paths.bridgeSocket ? inode("socket", 1102, 1202, 0o666) : stat(p);
    expect(() => checkSeparatedMergeIdentities(paths, ids, badStat)).toThrow();
  });
  it("rejects a symlinked database", () => {
    const badStat = (p) => p === paths.database ? { ...stat(p), isSymbolicLink: () => true } : stat(p);
    expect(() => checkSeparatedMergeIdentities(paths, ids, badStat)).toThrow();
  });
});
