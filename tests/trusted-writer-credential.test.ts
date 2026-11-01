import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readTrustedWriterCredential } from "../src/authenticated-trusted-writer.ts";

describe("trusted writer credential file", () => {
  it("accepts a private writer-owned regular file", () => {
    const root = mkdtempSync(join(tmpdir(), "foundry-secret-"));
    try {
      const path = join(root, "credential");
      writeFileSync(path, "a".repeat(64) + "\n", { mode: 0o600 });
      chmodSync(path, 0o600);
      expect(readTrustedWriterCredential(path)).toBe("a".repeat(64));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects symlink credentials even when the target is private", () => {
    const root = mkdtempSync(join(tmpdir(), "foundry-secret-"));
    try {
      const target = join(root, "target");
      const link = join(root, "link");
      writeFileSync(target, "a".repeat(64), { mode: 0o600 });
      chmodSync(target, 0o600);
      symlinkSync(target, link);
      expect(() => readTrustedWriterCredential(link)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects insecure modes and malformed credentials", () => {
    const root = mkdtempSync(join(tmpdir(), "foundry-secret-"));
    try {
      const path = join(root, "credential");
      writeFileSync(path, "a".repeat(64), { mode: 0o600 });
      chmodSync(path, 0o644);
      expect(() => readTrustedWriterCredential(path)).toThrow("private writer-owned");
      chmodSync(path, 0o600);
      writeFileSync(path, "not-a-secret");
      expect(() => readTrustedWriterCredential(path)).toThrow("32 bytes");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
