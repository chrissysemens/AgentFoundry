import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createSignedSipApprovalGateway } from "../src/signed-sip-approval-gateway.ts";
import { sipAttestationSigningBytes } from "../src/signed-sip-attestation.ts";

const payload = {
  repository: "owner/repo",
  issue_number: 7,
  comment_id: 456,
  author_id: 123,
  sip_revision: "v1",
  sip_git_sha: "a".repeat(40),
  sip_sha256: "b".repeat(64),
  approved_at: "2026-10-31T12:00:00.000Z",
};

describe("signed SIP evidence gateway", () => {
  it("verifies retained evidence and rejects tampering", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const getGitHub = vi.fn(async () => ({}));
    let retained: unknown = {
      payload,
      key_id: "operator",
      signature_base64: sign(
        null,
        sipAttestationSigningBytes(payload),
        privateKey,
      ).toString("base64"),
    };
    const gateway = createSignedSipApprovalGateway(
      getGitHub,
      "sips/7.md",
      "v1",
      { get: async () => retained },
      {
        trusted_keys: {
          operator: publicKey.export({ type: "spki", format: "pem" }).toString(),
        },
      },
    );
    await expect(
      gateway.verifyAttestation("owner/repo", 456),
    ).resolves.toEqual(payload);
    retained = {
      ...(retained as object),
      payload: { ...payload, author_id: 999 },
    };
    await expect(
      gateway.verifyAttestation("owner/repo", 456),
    ).rejects.toThrow("Invalid SIP attestation signature");
    retained = undefined;
    await expect(
      gateway.verifyAttestation("owner/repo", 456),
    ).resolves.toBeUndefined();
    expect(getGitHub).not.toHaveBeenCalled();
  });
});
