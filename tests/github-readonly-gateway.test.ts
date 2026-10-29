import { describe, expect, it, vi } from "vitest";
import { createReadOnlyGitHubApprovalGateway } from "../src/github-readonly-gateway.ts";

const sha = "a".repeat(40);
const timestamp = "2026-10-30T12:00:00Z";
const comment = {
  id: 456,
  issue_url: "https://api.github.com/repos/owner/repo/issues/7",
  user: { id: 123, type: "User" },
  created_at: timestamp,
  updated_at: timestamp,
  body: `Approved SIP revision 3 at ${sha}`,
};
const sip = {
  type: "file",
  encoding: "base64",
  content: Buffer.from("# SIP revision 3\n").toString("base64"),
};

describe("read-only GitHub approval gateway", () => {
  it("reads the exact comment and derives the issue identity from GitHub", async () => {
    const get = vi.fn(async () => comment);
    const gateway = createReadOnlyGitHubApprovalGateway(
      get,
      "docs/SIP.md",
      "3",
    );
    const result = await gateway.fetchComment("owner/repo", 456);
    expect(get).toHaveBeenCalledWith(
      "/repos/owner/repo/issues/comments/456",
    );
    expect(result.issue_number).toBe(7);
    expect(result.author_id).toBe(123);
  });

  it("rejects a comment belonging to another repository", async () => {
    const gateway = createReadOnlyGitHubApprovalGateway(
      async () => ({
        ...comment,
        issue_url: "https://api.github.com/repos/other/repo/issues/7",
      }),
      "docs/SIP.md",
      "3",
    );
    await expect(
      gateway.fetchComment("owner/repo", 456),
    ).rejects.toThrow("Invalid GitHub approval comment response");
  });

  it("rejects mismatched comment IDs and malformed API records", async () => {
    const gateway = createReadOnlyGitHubApprovalGateway(
      async () => ({ ...comment, id: 999 }),
      "docs/SIP.md",
      "3",
    );
    await expect(
      gateway.fetchComment("owner/repo", 456),
    ).rejects.toThrow("Invalid GitHub approval comment response");
    const malformed = createReadOnlyGitHubApprovalGateway(
      async () => null,
      "docs/SIP.md",
      "3",
    );
    await expect(
      malformed.fetchComment("owner/repo", 456),
    ).rejects.toThrow("Malformed GitHub API response");
  });

  it("fetches SIP bytes at the exact commit, not the branch tip", async () => {
    const get = vi.fn(async () => sip);
    const gateway = createReadOnlyGitHubApprovalGateway(
      get,
      "docs/SIP.md",
      "3",
    );
    const result = await gateway.fetchSipAtCommit("owner/repo", sha);
    expect(get).toHaveBeenCalledWith(
      `/repos/owner/repo/contents/docs/SIP.md?ref=${sha}`,
    );
    expect(result).toEqual({
      revision: "3",
      git_sha: sha,
      utf8_content: "# SIP revision 3\n",
    });
  });

  it("rejects invalid SHA, non-file responses and invalid UTF-8", async () => {
    const gateway = createReadOnlyGitHubApprovalGateway(
      async () => sip,
      "docs/SIP.md",
      "3",
    );
    await expect(
      gateway.fetchSipAtCommit("owner/repo", "main"),
    ).rejects.toThrow("Full Git SHA required");
    const directory = createReadOnlyGitHubApprovalGateway(
      async () => ({ ...sip, type: "dir" }),
      "docs/SIP.md",
      "3",
    );
    await expect(
      directory.fetchSipAtCommit("owner/repo", sha),
    ).rejects.toThrow("Invalid GitHub SIP contents response");
    const invalidUtf8 = createReadOnlyGitHubApprovalGateway(
      async () => ({
        ...sip,
        content: Buffer.from([255]).toString("base64"),
      }),
      "docs/SIP.md",
      "3",
    );
    await expect(
      invalidUtf8.fetchSipAtCommit("owner/repo", sha),
    ).rejects.toThrow("SIP must be valid UTF-8");
  });

  it("fails closed without an immutable attestation verifier", async () => {
    const gateway = createReadOnlyGitHubApprovalGateway(
      async () => comment,
      "docs/SIP.md",
      "3",
    );
    await expect(
      gateway.verifyAttestation("owner/repo", 456),
    ).resolves.toBeUndefined();
  });

  it("rejects unsafe configured SIP paths", () => {
    expect(() =>
      createReadOnlyGitHubApprovalGateway(
        async () => sip,
        "../secret",
        "3",
      ),
    ).toThrow("Unsafe configured SIP path");
  });
});
