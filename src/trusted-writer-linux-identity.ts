import { lstatSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Fail closed when a writer process has inherited dangerous privileges.
 * Filesystem ownership alone cannot establish a security boundary.
 */
export function assertTrustedWriterLinuxIdentity(
  databasePath: string,
  socketPath: string,
): void {
  if (process.platform !== "linux") {
    throw new Error("Trusted writer requires Linux");
  }
  const uid = process.getuid?.();
  const euid = process.geteuid?.();
  const gid = process.getgid?.();
  const egid = process.getegid?.();
  if (
    uid === undefined ||
    euid === undefined ||
    gid === undefined ||
    egid === undefined ||
    uid === 0 ||
    gid === 0 ||
    uid !== euid ||
    gid !== egid
  ) {
    throw new Error("Trusted writer requires dedicated non-root real/effective identity");
  }
  if (process.getgroups?.().includes(0)) {
    throw new Error("Trusted writer cannot retain root supplementary group");
  }
  const db = resolve(databasePath);
  const socket = resolve(socketPath);
  for (const [name, path] of [
    ["database", db],
    ["database directory", dirname(db)],
    ["socket directory", dirname(socket)],
  ] as const) {
    const info = lstatSync(path);
    if (info.isSymbolicLink() || info.uid !== uid || (info.mode & 0o077) !== 0) {
      throw new Error(`Unsafe ${name} ownership or permissions`);
    }
    if (name === "database" ? !info.isFile() : !info.isDirectory()) {
      throw new Error(`Invalid ${name} file type`);
    }
  }
  const parent = statSync(dirname(db));
  if ((parent.mode & 0o200) === 0) {
    throw new Error("Trusted writer database directory must be writable");
  }
}
