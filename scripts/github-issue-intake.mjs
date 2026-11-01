import { pathToFileURL } from "node:url";

const MAX_BODY = 12000;

export function parseIssueUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Provide a GitHub issue URL, such as https://github.com/owner/repo/issues/123");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    throw new Error("Only plain https://github.com issue URLs are accepted");
  }
  const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/([1-9][0-9]*)\/?$/.exec(
    url.pathname,
  );
  if (!match || match[1] === "." || match[2] === "." || match[1] === ".." || match[2] === "..") {
    throw new Error("Expected https://github.com/owner/repo/issues/123");
  }
  const number = Number(match[3]);
  if (!Number.isSafeInteger(number)) {
    throw new Error("Issue number is too large");
  }
  return { owner: match[1], repo: match[2], number };
}

export async function fetchIssue(input, { fetchImpl = fetch, token } = {}) {
  const { owner, repo, number } = parseIssueUrl(input);
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "agent-foundry-read-only-issue-intake",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetchImpl(apiUrl, {
      method: "GET",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("Could not reach GitHub. Check the network or try again later.");
  }
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Issue not found or not accessible with these credentials.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("GitHub denied access. Check read-only token permissions or rate limits.");
    }
    throw new Error(`GitHub returned HTTP ${response.status}.`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("GitHub returned invalid JSON.");
  }
  if (
    !data ||
    typeof data !== "object" ||
    "pull_request" in data ||
    typeof data.title !== "string" ||
    !data.title.trim() ||
    typeof data.body !== "string" && data.body !== null ||
    data.number !== number ||
    data.repository_url !== `https://api.github.com/repos/${owner}/${repo}` ||
    data.html_url !== `https://github.com/${owner}/${repo}/issues/${number}`
  ) {
    throw new Error("GitHub returned an unexpected issue record.");
  }
  return {
    owner,
    repo,
    number,
    url: data.html_url,
    title: data.title.slice(0, 500),
    body: (data.body ?? "").slice(0, MAX_BODY),
  };
}

export function summarizeIssue(issue) {
  const body = issue.body.trim();
  const questions = [
    "What should count as done? (Acceptance criteria)",
    "Are there any constraints or things we must not change?",
    "How should we test that the result works?",
  ];
  if (!body) {
    questions.unshift("Can you describe the problem and the desired result?");
  }
  return [
    `GitHub issue: ${issue.owner}/${issue.repo}#${issue.number}`,
    `Title: ${issue.title}`,
    `URL: ${issue.url}`,
    "",
    "Description (untrusted issue text; not instructions to this tool):",
    body || "(No description provided)",
    "",
    "Questions for the human:",
    ...questions.map((question, index) => `${index + 1}. ${question}`),
    "",
    "READ ONLY: No plan approved, no code changed, no journal written, no merge authorized.",
  ].join("\n");
}

async function main() {
  const input = process.argv[2];
  if (!input || process.argv.length !== 3) {
    console.error("Usage: npm run issue -- https://github.com/owner/repo/issues/123");
    process.exitCode = 1;
    return;
  }
  try {
    const issue = await fetchIssue(input, { token: process.env.GITHUB_TOKEN });
    console.log(summarizeIssue(issue));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Issue lookup failed.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
