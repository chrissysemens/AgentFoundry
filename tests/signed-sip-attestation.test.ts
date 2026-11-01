import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  sipAttestationSigningBytes,
  verifySignedSipApprovalAttestation,
} from "../src/signed-sip-attestation.ts";

const payload = {
  repository: "owner/repo",
  issue_number: 7,
  comment_id: 456,
  author_id: 123,
  sip_revision: "v2",
  sip_git_sha: "a".repeat(40),
  sip_sha256: "b".repeat(64),
  approved_at: "2026-10-31T12:00:00.000Z",
};

describe("signed SIP approval attestation", () => {
  it("verifies exact signed evidence and rejects tampering, revocation and wrong lookup", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const trusted_keys = {
      operator: publicKey.export({ type: "spki", format: "pem" }).toString(),
    };
    const entry = {
      payload,
      key_id: "operator",
      signature_base64: sign(
        null,
        sipAttestationSigningBytes(payload),
        privateKey,
      ).toString("base64"),
    };
    const store = { get: async () => entry };
    await expect(
      verifySignedSipApprovalAttestation(
        store,
        { trusted_keys },
        "owner/repo",
        456,
      ),
    ).resolves.toEqual(payload);
    await expect(
      verifySignedSipApprovalAttestation(
        store,
        { trusted_keys },
        "owner/repo",
        457,
      ),
    ).rejects.toThrow("Invalid signed SIP attestation");
    await expect(
      verifySignedSipApprovalAttestation(
        {
          get: async () => ({
            ...entry,
            payload: { ...payload, sip_revision: "v3" },
          }),
        },
        { trusted_keys },
        "owner/repo",
        456,
      ),
    ).rejects.toThrow("Invalid SIP attestation signature");
    await expect(
      verifySignedSipApprovalAttestation(
        store,
        { trusted_keys, revoked_key_ids: ["operator"] },
        "owner/repo",
        456,
      ),
    ).rejects.toThrow("Revoked SIP attestation key");
  });
});
