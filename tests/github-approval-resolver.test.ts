import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveGitHubSipApproval } from "../src/github-approval-resolver.ts";
import type { TrustedGitHubApprovalGateway } from "../src/github-approval-resolver.ts";
import type { GitHubApprovalPolicy } from "../src/github-approval-evidence.ts";
import type { SipApprovalReceipt } from "../src/sip-approval.ts";

const gitSha = "a".repeat(40);
const content = "# Approved SIP revision 3\n";
const digest = createHash("sha256").update(content).digest("hex");
const time = "2026-10-30T00:00:00.000Z";
const receipt: SipApprovalReceipt = {
  sip_revision: "3",
  sip_sha256: digest,
  sip_git_sha: gitSha,
  approver_id: "123",
  approved_at: time,
  source: "github-issue-comment",
  source_event_id: "456",
};
const policy: GitHubApprovalPolicy = {
  repository: "owner/repo",
  issue_number: 1,
  allowed_human_ids: [123],
};
const gateway: TrustedGitHubApprovalGateway = {
  async fetchComment(repository, commentId) {
    return {
      repository,
      issue_number: 1,
      comment_id: commentId,
      author_id: 123,
      author_type: "User",
      created_at: time,
      updated_at: time,
      body: `Approved SIP 3 ${gitSha} ${digest}`,
    };
  },
  async verifyAttestation(repository, commentId) {
    return {
      repository,
      issue_number: 1,
      comment_id: commentId,
      author_id: 123,
      sip_revision: "3",
      sip_git_sha: gitSha,
      sip_sha256: digest,
      approved_at: time,
    };
  },
  async fetchSipAtCommit(_repository, sha) {
    return { revision: "3", git_sha: sha, utf8_content: content };
  },
};

describe("trusted GitHub SIP approval resolution", () => {
  it("accepts matching independently resolved evidence", async () => {
    const result = await resolveGitHubSipApproval(receipt, policy, gateway);
    expect(result.human.approver_id).toBe("123");
    expect(result.sip.utf8_content).toBe(content);
  });

  it("rejects absent immutable attestation", async () => {
    const untrusted = {
      ...gateway,
      verifyAttestation: async () => undefined,
    };
    await expect(
      resolveGitHubSipApproval(receipt, policy, untrusted),
    ).rejects.toThrow("Immutable approval attestation required");
  });

  it("rejects SIP bytes that do not match the digest", async () => {
    const tampered = {
      ...gateway,
      fetchSipAtCommit: async () => ({
        revision: "3",
        git_sha: gitSha,
        utf8_content: "changed",
      }),
    };
    await expect(
      resolveGitHubSipApproval(receipt, policy, tampered),
    ).rejects.toThrow("SIP content digest mismatch");
  });

  it("rejects nonnumeric comment identifiers before any API call", async () => {
    await expect(
      resolveGitHubSipApproval(
        { ...receipt, source_event_id: "forged" },
        policy,
        gateway,
      ),
    ).rejects.toThrow("Numeric GitHub comment ID required");
  });
});
