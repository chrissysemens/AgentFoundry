import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileSipAttestationStore } from "../src/file-sip-attestation-store.ts";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("file SIP attestation store", () => {
  it("retains an attestation across instances and rejects overwrite", async () => {
    const directory = mkdtempSync(join(tmpdir(), "af-attestation-"));
    directories.push(directory);
    const first = new FileSipAttestationStore(directory);
    const signed = {
      payload: {
        repository: "owner/repo",
        issue_number: 7,
        comment_id: 456,
        author_id: 123,
        sip_revision: "v1",
        sip_git_sha: "a".repeat(40),
        sip_sha256: "b".repeat(64),
        approved_at: "2026-10-31T12:00:00.000Z",
      },
      key_id: "operator",
      signature_base64: "c".repeat(88),
    };
    await expect(first.putIfAbsent("owner/repo", 456, signed)).resolves.toBe(
      true,
    );
    const restarted = new FileSipAttestationStore(directory);
    await expect(restarted.get("owner/repo", 456)).resolves.toEqual(signed);
    await expect(restarted.putIfAbsent("owner/repo", 456, signed)).resolves.toBe(
      false,
    );
    await expect(restarted.get("owner/repo", 457)).resolves.toBeUndefined();
    await expect(
      restarted.putIfAbsent("owner/repo", 457, signed),
    ).rejects.toThrow("Attestation storage key mismatch");
  });
});
