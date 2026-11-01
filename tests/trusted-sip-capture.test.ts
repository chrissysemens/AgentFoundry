import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { captureSignedSipApproval } from "../src/trusted-sip-capture.ts";
import { verifySignedSipApprovalAttestation } from "../src/signed-sip-attestation.ts";

const attestation = {
  repository: "owner/repo",
  issue_number: 7,
  comment_id: 456,
  author_id: 123,
  sip_revision: "v2",
  sip_git_sha: "a".repeat(40),
  sip_sha256: "b".repeat(64),
  approved_at: "2026-10-31T12:00:00.000Z",
};
const policy = {
  repository: "owner/repo",
  issue_number: 7,
  allowed_human_ids: [123],
};
const comment = {
  repository: "owner/repo",
  issue_number: 7,
  comment_id: 456,
  author_id: 123,
  author_type: "User",
  created_at: attestation.approved_at,
  updated_at: attestation.approved_at,
  body: `APPROVE ${attestation.sip_revision} ${attestation.sip_git_sha} ${attestation.sip_sha256}`,
};

describe("trusted SIP approval capture", () => {
  it("signs authenticated evidence and refuses duplicate retention", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    let retained: unknown;
    const putIfAbsent = vi.fn(async (_repo: string, _commentId: number, signed: unknown) => {
      if (retained) return false;
      retained = signed;
      return true;
    });
    const dependencies = {
      fetchComment: vi.fn(async () => comment),
      sink: { putIfAbsent },
      privateKeyPem: privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString(),
      keyId: "operator",
    };
    const signed = await captureSignedSipApproval(
      policy,
      attestation,
      dependencies,
    );
    expect(signed.payload).toEqual(attestation);
    await expect(
      verifySignedSipApprovalAttestation(
        { get: async () => retained },
        {
          trusted_keys: {
            operator: publicKey
              .export({ type: "spki", format: "pem" })
              .toString(),
          },
        },
        "owner/repo",
        456,
      ),
    ).resolves.toEqual(attestation);
    await expect(
      captureSignedSipApproval(policy, attestation, dependencies),
    ).rejects.toThrow("already retained");
  });

  it("refuses edited comments before signing or retaining", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const putIfAbsent = vi.fn(async () => true);
    await expect(
      captureSignedSipApproval(policy, attestation, {
        fetchComment: async () => ({
          ...comment,
          updated_at: "2026-11-01T12:00:00.000Z",
        }),
        sink: { putIfAbsent },
        privateKeyPem: privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
        keyId: "operator",
      }),
    ).rejects.toThrow("Approval capture source is not trusted");
    expect(putIfAbsent).not.toHaveBeenCalled();
  });
});
