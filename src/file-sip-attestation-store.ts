import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, join } from "node:path";
import type { ImmutableSipAttestationSink } from "./trusted-sip-capture.ts";
import type {
  SignedSipApprovalAttestation,
  SignedSipApprovalAttestationStore,
} from "./signed-sip-attestation.ts";

/**
 * Durable create-once filesystem store. The directory MUST be protected by
 * OS-enforced identity isolation; O_EXCL is not an immutability boundary.
 */
export class FileSipAttestationStore
  implements ImmutableSipAttestationSink, SignedSipApprovalAttestationStore
{
  constructor(private readonly directory: string) {
    if (!isAbsolute(directory)) {
      throw new Error("Absolute attestation directory required");
    }
  }

  private path(repository: string, commentId: number): string {
    if (
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
      !Number.isSafeInteger(commentId) ||
      commentId <= 0
    ) {
      throw new Error("Invalid attestation storage key");
    }
    const digest = createHash("sha256")
      .update(JSON.stringify([repository, commentId]))
      .digest("hex");
    return join(this.directory, `${digest}.json`);
  }

  async putIfAbsent(
    repository: string,
    commentId: number,
    signed: SignedSipApprovalAttestation,
  ): Promise<boolean> {
    if (
      signed.payload.repository !== repository ||
      signed.payload.comment_id !== commentId
    ) {
      throw new Error("Attestation storage key mismatch");
    }
    const path = this.path(repository, commentId);
    let fd: number;
    try {
      fd = openSync(
        path,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
    try {
      writeFileSync(fd, JSON.stringify(signed), "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    const dirFd = openSync(
      this.directory,
      constants.O_RDONLY | constants.O_DIRECTORY,
    );
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
    return true;
  }

  async get(repository: string, commentId: number): Promise<unknown> {
    const path = this.path(repository, commentId);
    let fd: number;
    try {
      fd = openSync(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    try {
      const info = fstatSync(fd);
      if (!info.isFile() || info.size > 16_384 || info.size === 0) {
        throw new Error("Invalid retained attestation file");
      }
      return JSON.parse(readFileSync(fd, "utf8")) as unknown;
    } finally {
      closeSync(fd);
    }
  }
}
