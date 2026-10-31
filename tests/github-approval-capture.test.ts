import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { captureGitHubApproval } from "../src/github-approval-capture.ts";
import { createReadOnlyGitHubApprovalGateway } from "../src/github-readonly-gateway.ts";
import { digest } from "../src/domain.ts";

const sha = "b".repeat(40);
const content = "# SIP Rev3\n";
const timestamp = "2026-10-31T10:00:00Z";
const policy = {
  repository: "owner/repo",
  issue_number: 5,
  allowed_human_ids: [123],
};
const { privateKey } = generateKeyPairSync("ed25519");
const signer = {
  keyId: "operator-key",
  signApproval: async (bytes: Buffer) => sign(null, bytes, privateKey),
};

function gateway(edited = false) {
  const get = vi.fn(async (path: string): Promise<unknown> => {
    if (path.includes("/issues/comments/42")) {
      return {
        id: 42,
        issue_url: "https://api.github.com/repos/owner/repo/issues/5",
        user: { id: 123, type: "User" },
        created_at: timestamp,
        updated_at: edited ? "2026-10-31T10:01:00Z" : timestamp,
        body: `Approved Rev3 ${sha} ${digest(content)}`,
      };
    }
    if (path.includes("/contents/docs/sip.md?ref=")) {
      return {
        type: "file",
        encoding: "base64",
        content: Buffer.from(content).toString("base64"),
      };
    }
    throw new Error("Unexpected GitHub request");
  });
  return {
    get,
    client: createReadOnlyGitHubApprovalGateway(get, "docs/sip.md", "Rev3"),
  };
}

describe("authenticated GitHub approval capture", () => {
  it("fetches exact comment and commit before signing and retaining", async () => {
    const { get, client } = gateway();
    const createOnce = vi.fn(async () => {});
    const signed = await captureGitHubApproval(
      client,
      policy,
      42,
      sha,
      signer,
      { createOnce },
    );
    expect(signed.payload.sip_git_sha).toBe(sha);
    expect(signed.payload.sip_sha256).toBe(digest(content));
    expect(createOnce).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith(
      `/repos/owner/repo/contents/docs/sip.md?ref=${sha}`,
    );
  });

  it("fails closed for edited comments without retaining evidence", async () => {
    const { client } = gateway(true);
    const createOnce = vi.fn(async () => {});
    await expect(
      captureGitHubApproval(client, policy, 42, sha, signer, { createOnce }),
    ).rejects.toThrow("Approval capture source is not trusted");
    expect(createOnce).not.toHaveBeenCalled();
  });

  it("rejects untrusted commit IDs before GitHub access", async () => {
    const { get, client } = gateway();
    await expect(
      captureGitHubApproval(client, policy, 42, "main", signer, {
        createOnce: async () => {},
      }),
    ).rejects.toThrow("Trusted SIP commit must be a full Git SHA");
    expect(get).not.toHaveBeenCalled();
  });
});
