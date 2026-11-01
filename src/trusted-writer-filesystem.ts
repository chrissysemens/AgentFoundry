import { lstatSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

/**
 * Fail-closed startup checks for the dedicated writer process.
 *
 * These checks supplement, but cannot replace, deployment mount isolation,
 * peer authentication and cross-UID negative tests.
 */
export function assertTrustedWriterFilesystem(
  databasePath: string,
  socketPath: string,
  bridgeGid?: number,
): void {
  if (process.platform !== "linux") {
    throw new Error("Trusted writer deployment requires Linux");
  }
  const uid = process.getuid?.();
  if (uid === undefined || uid === 0) {
    throw new Error("Trusted writer must run as a dedicated non-root UID");
  }
  if (
    bridgeGid !== undefined &&
    (!Number.isSafeInteger(bridgeGid) ||
      bridgeGid <= 0 ||
      process.getgroups?.().includes(bridgeGid) !== true)
  ) {
    throw new Error("Writer must be a member of the designated bridge IPC group");
  }
  if (!isAbsolute(databasePath) || !isAbsolute(socketPath)) {
    throw new Error("Database and socket paths must be absolute");
  }
  const db = resolve(databasePath);
  const socket = resolve(socketPath);
  if (db === socket) throw new Error("Socket and database paths must differ");
  const dbDir = dirname(db);
  const socketDir = dirname(socket);
  if (dbDir === socketDir) {
    throw new Error("Socket and database directories must be separate");
  }
  for (const [name, path] of [
    ["database directory", dbDir],
    ["socket directory", socketDir],
  ] as const) {
    const info = lstatSync(path);
    const sharedSocketDir = name === "socket directory" && bridgeGid !== undefined;
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.uid !== uid ||
      (info.mode & 0o7777) !== (sharedSocketDir ? 0o710 : 0o700) ||
      (sharedSocketDir && info.gid !== bridgeGid)
    ) {
      throw new Error(
        `Unsafe ${name}: require private directory owned by writer`,
      );
    }
  }
  const file = lstatSync(db);
  if (
    !file.isFile() ||
    file.isSymbolicLink() ||
    file.uid !== uid ||
    (file.mode & 0o7777) !== 0o600
  ) {
    throw new Error("Unsafe SQLite file: require private file owned by writer");
  }
  const parent = statSync(dbDir);
  if ((parent.mode & 0o200) === 0) {
    throw new Error("Trusted writer cannot write database directory");
  }
  try {
    lstatSync(socket);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error("Socket path already exists");
}
