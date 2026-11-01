# Read a real GitHub issue (read-only pilot)

This is the **first real GitHub integration**, not an autonomous coding agent.

## Run it

With Node.js 24 and dependencies installed:

```bash
npm ci
npm run issue -- https://github.com/OWNER/REPO/issues/123
```

It fetches the issue, prints its title and description, and suggests three starting questions for the human. **The questions are fixed prompts, not AI-generated analysis.** That is deliberate: the first step proves we can safely read an issue before adding a planner.

For a private repository, set `GITHUB_TOKEN` to a token with **read-only Issues permission**. Do not paste tokens into command arguments, issues or logs. Public issues generally need no token, subject to GitHub rate limits.

The tool only makes a GET request to GitHub's fixed API endpoint. It does not create issues, modify code, write to the journal, call an AI model or merge anything. The issue description is **untrusted text**, not an instruction for an agent to execute.

## Test it

```bash
npm run issue:test
npm run verify
```

Tests use mocked responses, so they do not require credentials or network access.

## Next step

Add a real human-in-the-loop clarification and SIP drafting workflow. That is **not** included in this PR.
