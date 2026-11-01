import type { AuthenticatedGitHubGet } from "./github-readonly-gateway.ts";

/**
 * Narrow GitHub REST read transport for the trusted writer.
 * Token provisioning and network policy remain deployment responsibilities.
 */
export function createTrustedGitHubGet(token: string): AuthenticatedGitHubGet {
  if (
    !token ||
    [...token].some(
      (character) =>
        character.trim() === "" ||
        character.charCodeAt(0) < 32 ||
        character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error("Nonempty GitHub token required");
  }
  return async (path) => {
    const prefix = /^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\//;
    const suffix = path.replace(prefix, "");
    const comment = /^issues\/comments\/[1-9][0-9]*$/;
    const content = /^contents\/[A-Za-z0-9_.~%/-]+\?ref=[a-f0-9]{40}$/;
    if (
      !prefix.test(path) ||
      !(comment.test(suffix) || content.test(suffix)) ||
      path.includes("..") ||
      /%2f|%5c|%2e/i.test(path)
    ) {
      throw new Error("Unapproved GitHub read path");
    }
    const response = await fetch(`https://api.github.com${path}`, {
      method: "GET",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`GitHub read failed: HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("Unexpected GitHub response content type");
    }
    const length = response.headers.get("content-length");
    if (length !== null && Number(length) > 1024 * 1024) {
      throw new Error("GitHub response too large");
    }
    const body = await response.text();
    if (Buffer.byteLength(body) > 1024 * 1024) {
      throw new Error("GitHub response too large");
    }
    return JSON.parse(body) as unknown;
  };
}
