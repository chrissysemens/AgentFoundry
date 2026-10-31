# Agent Foundry

**The short version:** Agent Foundry is the beginnings of an AI software-development team. The goal is for you to describe what you want built, approve a clear plan, and then let AI agents write code, run tests and review one another's work. **You keep the final say.**

Agent Foundry is the **team and its rules**. **Mycelium** is a separate audio-plugin project that this team may work on later. Agent Foundry does not currently have autonomous access to Mycelium.

> **Where are we today?** We have built and tested much of the **safety and workflow foundation**. We have **not** yet built a complete, always-on AI development team. The current work is in [pull request #6](https://github.com/chrissysemens/AgentFoundry/pull/6), which is **open and unmerged**.

## The idea, without the jargon

Imagine hiring a tiny software company:

- **You are the boss.** You decide what needs doing, approve the plan, test the result and explicitly authorize any merge.
- **The planner asks questions.** We call this **Grill Me**. It turns a vague idea into something specific.
- **The developer writes the code.** It should also write or update tests.
- **The Oracle checks the developer's work.** It is an independent reviewer, not the person who wrote the code. It must not quietly fix the implementation it is judging.
- **The School keeps lessons.** It records what went wrong and suggests improvements, without silently changing the rules.

A few words you will see:

| Word                  | Plain-English meaning                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| **Issue**             | A task or request, usually on GitHub.                                                                |
| **SIP**               | The written plan for one task: what we will change and how we will know it works.                    |
| **PR (pull request)** | A proposed code change you can inspect before it becomes part of the main project.                   |
| **CI**                | Automatic checks that run when code is pushed, such as formatting, tests and security checks.        |
| **Oracle**            | The independent reviewer that checks the code against the approved plan.                             |
| **Merge**             | Accepting the PR into the main codebase. This requires a **separate, explicit human authorization**. |
| **Journal**           | The history of what happened, so decisions can be checked later.                                     |

## How using it is supposed to work

**This is the intended future experience, not a feature that is already fully running.**

1. **You open a GitHub issue.** For example: “Make Mycelium's preset browser easier to use.”
2. **Grill Me asks the missing questions.** What feels wrong today? What should happen instead? What must stay unchanged?
3. **The planner writes a SIP.** You read a clear description of the changes, risks and tests.
4. **You approve that exact SIP.** The system must know **which version** you approved. An old approval cannot be reused for a different plan or ticket.
5. **A developer agent works on a branch.** It writes the change and tests, then opens a PR. It does not merge.
6. **GitHub runs CI.** Formatting, linting, TypeScript checks, tests and other configured checks must pass.
7. **The independent Oracle reviews the exact code commit.** It compares the implementation with the approved SIP and reports findings. If rejected, the developer may make up to **three repair attempts** before escalating.
8. **You test the result.** For an audio plugin, that means real-world behavior matters, not just green automated checks.
9. **You explicitly authorize the merge, separately.** Approving a SIP, saying “keep going,” or seeing green CI **never counts as merge permission**.
10. **The journal and School retain the evidence and lessons.** Future work can benefit without rewriting history.

### What a normal day should eventually feel like

You: “I'd like Mycelium to remember my last selected preset.”

Agent Foundry: “Should that survive restarting the DAW? Should it be saved per project?”

You answer, read the SIP and approve it. The agents then do the coding and checking. You receive a PR to try, along with the tests and Oracle's verdict. **Nothing gets merged until you explicitly say so.**

That complete experience is **the destination**, not today's installed product.

## What we have actually built

The repository currently contains working TypeScript/Node.js components and automated tests for:

- **Workflow rules:** ticket states, SIP approval, review decisions, bounded repair attempts and separate merge-authorization rules in the workflow model.
- **History:** an in-memory journal and a SQLite journal. SQLite has triggers to reject ordinary updates and deletes to existing events.
- **Approval verification:** checks that a GitHub approval matches a particular SIP revision, exact Git commit and SHA-256 content digest.
- **Signed evidence:** Ed25519 signature verification using configured trusted public keys, plus interfaces for independently retained approval records.
- **Fail-closed writing and replay:** the verified writer rechecks independent approval evidence, including historical approvals after a restart, and refuses to proceed when that evidence is unavailable or invalid.
- **Ticket isolation:** the verified writer is bound to a trusted ticket ID to prevent reuse of an issue's approval on another ticket. This was added in response to a serious independent review finding and is still subject to CI and follow-up review.
- **Security regression tests:** tampered signatures, revoked evidence, restarts, concurrent calls, cross-ticket access, direct SQLite changes and forged approval events.
- **Review formats and guidance:** JSON Schemas, an Oracle protocol, SIP documents, a security-review handoff and deployment requirements.
- **Local demonstration and CI:** a small CLI demo, Vitest tests, Prettier, ESLint, TypeScript checks and GitHub Actions workflows for Quality and dependency auditing.

**Important distinction:** a tested component is not the same as a securely deployed service. SQLite triggers do **not** stop someone with unrestricted database access from inserting events or changing the database itself. The verified writer is a security boundary only when the application prevents callers from bypassing it.

## What's still to do

In practical order:

1. **Finish review of PR #6.** Confirm the latest CI result, resolve the cross-ticket approval finding, and obtain a fresh independent review of the **exact final commit**. An automated code review is useful, but is not automatically an Oracle ACCEPT verdict.
2. **Make approvals trustworthy in production.** Implement and deploy authenticated GitHub access, protected signing keys, genuinely immutable approval storage, revocation policy and operational audit evidence. The current interfaces and tests are not a deployed trust service.
3. **Lock down who can do what.** Isolate the journal/database so other processes cannot bypass the verified writer; address multi-process concurrency; independently authenticate the human who authorizes a merge. An actor string such as `human:owner` is not proof of identity.
4. **Build the real agent orchestration.** Wire GitHub issues, Grill Me, SIP approval, developer work, PR creation, CI results, Oracle review, repair cycles and human testing into one usable flow.
5. **Add safe project integration.** Configure a narrowly scoped GitHub App or equivalent for Mycelium, with explicit permissions and no automatic merging.
6. **Run a supervised pilot.** Take one small Mycelium issue from questions through an approved SIP to a tested, reviewed PR. Fix the rough edges before expanding autonomy.

**Not done yet:** a hosted service, automatic issue pickup, autonomous coding-agent execution, end-to-end GitHub orchestration, production approval infrastructure, and a working Mycelium integration.

## Where the work stands

- **PR #6:** the active integration PR; **not merged**.
- **Quality and security CI:** must be checked on the **latest commit**, not assumed from an earlier green run.
- **Independent review:** identified a serious cross-ticket approval-reuse issue. A fix is in progress; a fresh review is required after it is green.
- **Earlier FOUND-002 Repair Attempt 2:** remains **INCONCLUSIVE**. Later work does not rewrite that verdict.
- **Human control:** no merge, deployment or Mycelium access is authorized merely by approving development work.

See [the current PR](https://github.com/chrissysemens/AgentFoundry/pull/6), [the Oracle protocol](docs/ORACLE-PROTOCOL.md), [the security-review handoff](docs/ORACLE-SECURITY-REVIEW-HANDOFF.md) and [the deployment requirements](docs/APPROVAL-EVIDENCE-DEPLOYMENT.md).

## If you want to run the local demo

You **do not need to do this** to follow the project. These instructions are for developers who want to run the current code on their own computer.

You need **Node.js 24** and npm. In a checkout of this repository:

```bash
npm ci
npm run verify
npm run cli -- demo
```

`npm ci` installs dependencies. `npm run verify` runs the local checks. `npm run cli -- demo` shows the workflow engine in action; **it does not launch a real AI development team or contact an AI provider**.

The code is designed to be **provider-agnostic**: it should not depend on one particular AI model, hosting provider or issue tracker.

## License

No license has been specified yet.
