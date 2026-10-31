import type { GitHubApprovalEvent } from "./github-approval-evidence.ts";
import type { TrustedGitHubApprovalGateway } from "./github-approval-resolver.ts";
import type { VerifiedSipContent } from "./sip-approval.ts";

/** Transport must use authenticated GitHub API requests with a trusted token. */
export type AuthenticatedGitHubGet = (path: string) => Promise<unknown>;

type GitHubCommentResponse = {
  id: number;
  issue_url: string;
  user: { id: number; type: string };
  created_at: string;
  updated_at: string;
  body: string | null;
};

type GitHubContentResponse = {
  type: string;
  encoding: string;
  content: string;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed GitHub API response");
  }
  return value as Record<string, unknown>;
}

function repositoryParts(repository: string): [string, string] {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repository);
  if (!match) throw new Error("Invalid configured GitHub repository");
  return [match[1]!, match[2]!];
}

/**
 * Read-only GitHub API gateway. No attestation verifier is supplied here:
 * a GitHub comment or contents API response cannot prove immutable approval.
 */
export function createReadOnlyGitHubApprovalGateway(
  get: AuthenticatedGitHubGet,
  sipPath: string,
  revision: string,
  trustedRevisionsByCommit?: Readonly<Record<string, string>>,
): TrustedGitHubApprovalGateway {
  if (
    !sipPath ||
    sipPath.startsWith("/") ||
    sipPath.split("/").some((part) => part === ".." || part === ".")
  ) {
    throw new Error("Unsafe configured SIP path");
  }
  const encodedPath = sipPath.split("/").map(encodeURIComponent).join("/");
  return {
    async fetchComment(repository, commentId): Promise<GitHubApprovalEvent> {
      const [owner, repo] = repositoryParts(repository);
      if (!Number.isSafeInteger(commentId) || commentId <= 0) {
        throw new Error("Invalid GitHub comment ID");
      }
      const data = record(
        await get(`/repos/${owner}/${repo}/issues/comments/${commentId}`),
      ) as unknown as GitHubCommentResponse;
      const user = record(data.user);
      const issuePrefix = `https://api.github.com/repos/${owner}/${repo}/issues/`;
      if (
        data.id !== commentId ||
        typeof data.issue_url !== "string" ||
        !data.issue_url.startsWith(issuePrefix) ||
        !/^[1-9][0-9]*$/.test(data.issue_url.slice(issuePrefix.length)) ||
        !Number.isSafeInteger(user.id) ||
        typeof user.type !== "string" ||
        typeof data.created_at !== "string" ||
        typeof data.updated_at !== "string" ||
        typeof data.body !== "string"
      ) {
        throw new Error("Invalid GitHub approval comment response");
      }
      return {
        repository,
        issue_number: Number(data.issue_url.slice(issuePrefix.length)),
        comment_id: data.id,
        author_id: user.id as number,
        author_type: user.type,
        created_at: data.created_at,
        updated_at: data.updated_at,
        body: data.body,
      };
    },
    async fetchSipAtCommit(repository, gitSha): Promise<VerifiedSipContent> {
      const [owner, repo] = repositoryParts(repository);
      if (!/^[a-f0-9]{40}$/.test(gitSha)) {
        throw new Error("Full Git SHA required");
      }
      const data = record(
        await get(
          `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${gitSha}`,
        ),
      ) as unknown as GitHubContentResponse;
      if (
        data.type !== "file" ||
        data.encoding !== "base64" ||
        typeof data.content !== "string" ||
        !/^[A-Za-z0-9+/=\s]+$/.test(data.content)
      ) {
        throw new Error("Invalid GitHub SIP contents response");
      }
      const bytes = Buffer.from(data.content.replace(/\s/g, ""), "base64");
      const utf8 = bytes.toString("utf8");
      if (!bytes.equals(Buffer.from(utf8, "utf8"))) {
        throw new Error("SIP must be valid UTF-8");
      }
      const resolvedRevision = trustedRevisionsByCommit
        ? trustedRevisionsByCommit[gitSha]
        : revision;
      if (
        typeof resolvedRevision !== "string" ||
        resolvedRevision.trim().length === 0
      ) {
        throw new Error("Trusted SIP revision mapping required for commit");
      }
      return {
        revision: resolvedRevision,
        git_sha: gitSha,
        utf8_content: utf8,
      };
    },
    async verifyAttestation() {
      // Fail closed until a separate, authenticated immutable store is wired.
      return undefined;
    },
  };
}
