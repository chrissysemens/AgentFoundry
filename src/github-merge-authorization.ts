import type { AuthenticatedGitHubGet } from "./github-readonly-gateway.ts";
import type { VerifiedMergeAuthorization } from "./merge-authorization.ts";

/**
 * GitHub comments are only identity and intent evidence. A separate trusted
 * approval store must confirm that the exact comment was authenticated,
 * recorded, and bound to the accepted code and Oracle review.
 */
type RetainedDecision = VerifiedMergeAuthorization | undefined;

export interface RetainedMergeDecisionReader {
  get(repository: string, commentId: number): Promise<RetainedDecision>;
}

export function createGitHubMergeAuthorizationResolver(
  get: AuthenticatedGitHubGet,
  retained: RetainedMergeDecisionReader,
  repository: string,
  issueNumber: number,
  commentId: number,
): (ticket: string) => Promise<VerifiedMergeAuthorization | undefined> {
  const parts = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repository);
  if (!parts || !Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("Invalid trusted merge repository or issue");
  }
  if (!Number.isSafeInteger(commentId) || commentId <= 0) {
    throw new Error("Invalid trusted merge comment ID");
  }
  const [, owner, repo] = parts;
  const path = `/repos/${owner}/${repo}/issues/comments/${commentId}`;
  const issueUrl = [
    "https://api.github.com/repos",
    owner,
    repo,
    "issues",
    issueNumber,
  ].join("/");

  return async (ticket) => {
    const raw: unknown = await get(path);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid authenticated merge comment");
    }
    const comment = raw as Record<string, unknown>;
    const user = comment.user;
    if (!user || typeof user !== "object" || Array.isArray(user)) {
      throw new Error("Invalid authenticated merge comment author");
    }
    const author = user as Record<string, unknown>;
    if (
      comment.id !== commentId ||
      comment.issue_url !== issueUrl ||
      author.type !== "User" ||
      !Number.isSafeInteger(author.id) ||
      (author.id as number) <= 0 ||
      typeof comment.body !== "string" ||
      typeof comment.created_at !== "string" ||
      !Number.isFinite(Date.parse(comment.created_at)) ||
      comment.updated_at !== comment.created_at
    ) {
      throw new Error("Untrusted merge comment provenance");
    }
    const decision = await retained.get(repository, commentId);
    if (
      !decision ||
      decision.ticket_id !== ticket ||
      decision.human_id !== author.id ||
      decision.authorized_at !== comment.created_at ||
      !/^[a-f0-9]{40}$/.test(decision.code_revision) ||
      !Number.isSafeInteger(decision.human_id) ||
      decision.human_id <= 0
    ) {
      throw new Error("Retained merge authorization mismatch");
    }
    const expected =
      `MERGE AUTHORIZE ${ticket} ${decision.implementation_id} ` +
      `${decision.code_revision} ${decision.review_id}`;
    if (comment.body.trim() !== expected) {
      throw new Error("Merge comment does not match retained decision");
    }
    return decision;
  };
}
