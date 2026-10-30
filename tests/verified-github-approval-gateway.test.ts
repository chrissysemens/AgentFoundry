import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createVerifiedGitHubApprovalGateway } from "../src/verified-github-approval-gateway.ts";
import { approvalAttestationSigningBytes } from "../src/signed-approval-attestation.ts";
import type { ApprovalAttestation } from "../src/github-approval-evidence.ts";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const sha = "a".repeat(40);
const payload: ApprovalAttestation = {
  repository: "owner/repo",
  issue_number: 7,
  comment_id: 456,
  author_id: 123,
  sip_revision: "3",
  sip_git_sha: sha,
  sip_sha256: "b".repeat(64),
  approved_at: "2026-10-30T12:00:00Z",
};
const signed = {
  payload,
  key_id: "operator",
  signature_base64: sign(
    null,
    approvalAttestationSigningBytes(payload),
    privateKey,
  ).toString("base64"),
};
const trust = {
  trusted_keys: {
    operator: publicKey.export({ type: "spki", format: "pem" }).toString(),
  },
};
const githubGet = async (path: string): Promise<unknown> => {
  if (path.endsWith("/issues/comments/456")) {
    return {
      id: 456,
      issue_url: "https://api.github.com/repos/owner/repo/issues/7",
      user: { id: 123, type: "User" },
      created_at: payload.approved_at,
      updated_at: payload.approved_at,
      body: "Approved SIP revision 3",
    };
  }
  return {
    type: "file",
    encoding: "base64",
    content: Buffer.from("# SIP\n").toString("base64"),
  };
};

describe("verified GitHub approval gateway", () => {
  it("combines authenticated GitHub reads with a separately signed record", async () => {
    const gateway = createVerifiedGitHubApprovalGateway(
      githubGet,
      "docs/SIP.md",
      "3",
      { get: async () => signed },
      trust,
    );
    await expect(
      gateway.fetchComment("owner/repo", 456),
    ).resolves.toMatchObject({ author_id: 123, issue_number: 7 });
    await expect(gateway.fetchSipAtCommit("owner/repo", sha)).resolves.toMatchObject({
      git_sha: sha,
      utf8_content: "# SIP\n",
    });
    await expect(gateway.verifyAttestation("owner/repo", 456)).resolves.toEqual(
      payload,
    );
  });

  it("rejects altered independent approval evidence", async () => {
    const gateway = createVerifiedGitHubApprovalGateway(
      githubGet,
      "docs/SIP.md",
      "3",
      { get: async () => ({ ...signed, payload: { ...payload, author_id: 999 } }) },
      trust,
    );
    await expect(gateway.verifyAttestation("owner/repo", 456)).rejects.toThrow(
      "Invalid approval attestation signature",
    );
  });

  it("fails closed when the independent store has no record", async () => {
    const gateway = createVerifiedGitHubApprovalGateway(
      githubGet,
      "docs/SIP.md",
      "3",
      { get: async () => undefined },
      trust,
    );
    await expect(
      gateway.verifyAttestation("owner/repo", 456),
    ).resolves.toBeUndefined();
  });
});
