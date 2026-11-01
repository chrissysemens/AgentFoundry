# First real GitHub pilot: a safe, supervised issue-to-PR path

**Status: proposal for human review, not an approved SIP or implemented feature.**

## In one sentence

Let Agent Foundry read a real GitHub issue, ask the owner what is missing, and prepare a written plan **without giving any AI permission to merge code**.

## Why this is next

The workflow rules and security components have automated tests. The manual Linux cross-UID fixture also passed on 1 November 2026. But the normal CLI still runs a simulation, not a real GitHub job.

The next useful proof is a **small real task with a person in charge at every decision point**.

## Stage 1: read a real issue (first implementation PR)

1. The user supplies a GitHub issue URL or repository and issue number.
2. A read-only GitHub client fetches the issue title, description, URL, issue number and repository identity.
3. It rejects malformed input, non-issue URLs, inaccessible issues and unexpected responses with clear errors.
4. It prints a plain-English summary and an explicit list of unanswered questions.
5. It saves **nothing privileged** to the merge journal and makes **no GitHub changes**.

**Acceptance checks:** tests for valid input, private/inaccessible issues, wrong repository, invalid data, network failures and accidental secret output. The default operation must not require write permissions.

## Stage 2: ask questions and write a SIP

A planner can propose clarification questions and a draft Software Implementation Plan. The human edits and explicitly approves the **exact revision** before coding starts. No approval is inferred from a comment such as "looks good".

## Stage 3: produce a supervised code PR

A coding agent gets access only to an isolated, disposable working branch. It proposes changes and opens a PR. Normal CI must run. The agent must not have access to the trusted writer's database, credentials or merge token.

## Stage 4: independent review and human testing

A separate Oracle reviews the exact PR commit against the approved SIP. The human tests the result. Changes to the plan or code invalidate stale approvals and reviews as required by the workflow rules.

## Stage 5: merge authorization (later, not part of first pilot)

Connect independently authenticated human evidence to the trusted writer and merge resolver. Prove that the final candidate commit is the one authorized. **Do not enable autonomous merging** until this deployed path has passed adversarial tests.

## Things we still need to build or prove

| Area | What remains |
| --- | --- |
| Real issue intake | Read-only GitHub integration and tests |
| Planning | Interactive questions, draft SIP and exact-version approval |
| Coding | Sandboxed agent runner, branch creation and PR integration |
| Reviewing | Operationally independent Oracle execution and exact-commit evidence |
| Human evidence | Real identity authentication, signing, storage, rotation and revocation |
| Trusted writer | Production deployment, credential handling and recovery |
| Security | Hostile bridge, secret exposure, restarts, races and full end-to-end tests |
| Reuse | Per-repository policy, permissions and easy onboarding |

## Rules for the first pilot

- Use a disposable or low-risk repository and a small task.
- No autonomous merge; the human uses ordinary GitHub review.
- Read-only access first; add write permissions only when the corresponding stage needs them.
- Never copy secrets into logs, issues, PR comments or agent prompts.
- Keep a clear audit trail of which issue, SIP revision and code commit were considered.
- Treat the successful cross-UID fixture as evidence for its tested boundary only, not a production security certificate.

## Decision requested

Approve **Stage 1 only** as the next implementation target: read a GitHub issue safely and display a clear, human-friendly summary and clarification questions. Later stages require their own review and approval.
