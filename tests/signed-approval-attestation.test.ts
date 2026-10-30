import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  approvalAttestationSigningBytes,
  verifySignedApprovalAttestation,
} from "../src/signed-approval-attestation.ts";
import type { ApprovalAttestation } from "../src/github-approval-evidence.ts";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const trust = {
  trusted_keys: {
    primary: publicKey.export({ type: "spki", format: "pem" }).toString(),
  },
};
const payload: ApprovalAttestation = {
  repository: "owner/repo",
  issue_number: 1,
  comment_id: 456,
  author_id: 123,
  sip_revision: "3",
  sip_git_sha: "a".repeat(40),
  sip_sha256: "b".repeat(64),
  approved_at: "2026-10-30T00:00:00.000Z",
};
const signed = {
  payload,
  key_id: "primary",
  signature_base64: sign(
    null,
    approvalAttestationSigningBytes(payload),
    privateKey,
  ).toString("base64"),
};
const store = (entry: unknown) => ({
  async get() {
    return entry;
  },
});

describe("signed immutable approval attestation verification", () => {
  it("accepts an authentic signature from a configured key", async () => {
    await expect(
      verifySignedApprovalAttestation(
        store(signed),
        trust,
        "owner/repo",
        456,
      ),
    ).resolves.toEqual(payload);
  });

  it("rejects tampering after signature creation", async () => {
    await expect(
      verifySignedApprovalAttestation(
        store({
          ...signed,
          payload: { ...payload, author_id: 999 },
        }),
        trust,
        "owner/repo",
        456,
      ),
    ).rejects.toThrow("Invalid approval attestation signature");
  });

  it("rejects unknown signing keys", async () => {
    await expect(
      verifySignedApprovalAttestation(
        store({ ...signed, key_id: "untrusted" }),
        trust,
        "owner/repo",
        456,
      ),
    ).rejects.toThrow("Untrusted approval signing key");
  });

  it("rejects cross-repository replay", async () => {
    await expect(
      verifySignedApprovalAttestation(
        store(signed),
        trust,
        "other/repo",
        456,
      ),
    ).rejects.toThrow("Signed approval identity mismatch");
  });

  it("fails closed on missing attestations", async () => {
    await expect(
      verifySignedApprovalAttestation(
        store(undefined),
        trust,
        "owner/repo",
        456,
      ),
    ).resolves.toBeUndefined();
  });
});
