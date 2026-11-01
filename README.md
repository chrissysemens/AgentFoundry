# Agent Foundry

**A supervised AI software-development team, built around GitHub.**

Imagine giving a team a job: one person asks what you actually want, another writes a plan, another writes the code, another checks the work, and **you decide whether it is allowed to go live**.

That is what Agent Foundry is being built to do. The "team members" will be AI agents, but **you remain the boss**.

**Important: this is a work in progress.** It is not yet an app you can install, point at a repository and leave running. Some of the foundations work and have been tested; the actual automatic AI team is not wired together yet.

Agent Foundry is **product-agnostic**. It is intended to work with _any_ software project in its own GitHub repository, regardless of whether that project is a website, desktop app, plugin, service or something else.

## Start here: the short version

- **You describe a job.** For example: "Add a dark mode setting."
- **The planner asks questions.** What should dark mode affect? Should it remember your choice?
- **You approve the written plan.** The AI cannot quietly change the job after that.
- **The coder proposes a change.** It writes code on a branch and submits a pull request.
- **Checks and a separate reviewer inspect it.** A different agent, called the Oracle, is meant to check the actual code against the plan.
- **You test it and decide.** Approving the plan is _not_ permission to merge code. Merging needs a second, explicit human decision.
- **The system keeps a record.** It should be possible to see what was approved, what changed, who reviewed it and why a merge was permitted.

**Today, that is the intended workflow, not a fully functioning end-to-end product.** The repository already has the rules, records, evidence checks and security building blocks needed to support it.

## The full journey, in plain English

```text
You create a GitHub issue ("Please build this")
                 |
                 v
Planner: "Grill Me" questions ("What exactly do you mean?")
                 |
                 v
Planner writes a SIP (the written plan)
                 |
                 v
YOU APPROVE THAT EXACT PLAN  <---- first human decision
                 |
                 v
Developer agent writes code on a separate branch
                 |
                 v
Pull request (PR) + automatic checks (CI)
                 |
                 v
Oracle (separate reviewer) checks code against the plan
                 |
           +-----+------+
           |            |
        Problems       Looks OK
           |            |
           v            v
       Fix and       YOU test it
       re-check          |
                        v
             YOU AUTHORIZE THE MERGE  <---- second human decision
                        |
                        v
              Trusted service checks proof
                        |
                        v
                  Merge allowed
```

**The key rule:** no agent should be able to treat "the plan is approved", "the tests passed" or "the reviewer likes it" as permission to merge. Those are different decisions.

### What the words mean

| Word                                   | In everyday language                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **GitHub issue**                       | The job ticket: what you want done.                                                                                         |
| **Grill Me**                           | The question-and-answer stage to stop the AI guessing.                                                                      |
| **SIP (Software Implementation Plan)** | The agreed written instructions: what to build, what not to build, and how to test it.                                      |
| **Revision / digest**                  | A specific version of a document and its fingerprint. This helps stop approval of one plan being reused for a changed plan. |
| **Agent**                              | An AI worker with a particular job.                                                                                         |
| **Developer agent**                    | The worker that writes or changes code.                                                                                     |
| **Oracle**                             | A separate reviewer. It judges the proposed change; it should not secretly approve its own work.                            |
| **Branch**                             | A separate workspace for changes, away from the main code.                                                                  |
| **PR (pull request)**                  | A proposed code change waiting for checks and review.                                                                       |
| **CI (continuous integration)**        | Automatic checks such as formatting, types and tests.                                                                       |
| **Journal**                            | The history book of what happened, stored in SQLite.                                                                        |
| **Trusted writer**                     | A restricted process allowed to record sensitive decisions in that history book.                                            |
| **Merge**                              | Putting the approved change into the main codebase.                                                                         |

## Who is allowed to do what?

| Who                                          | Job                                                                               | Important limit                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **You / human maintainer**                   | Choose the work, answer questions, approve plans, test results, authorize merges. | A vague "looks good" must not become automatic merge permission.   |
| **Planner**                                  | Ask questions and write a specific plan.                                          | Cannot approve its own plan on your behalf.                        |
| **Developer**                                | Write code and tests for the approved plan.                                       | Cannot manufacture human approval or give itself merge permission. |
| **Oracle**                                   | Independently review the exact code version against the plan.                     | Cannot make its own review count as your permission.               |
| **Trusted authorization service and writer** | Check the required proof and record a permitted merge decision.                   | Must not blindly trust what a coding agent says.                   |
| **Merge resolver**                           | Carry out a merge only when authorization is valid.                               | Cannot invent or write the authorization itself.                   |
| **School**                                   | Collect lessons for future work.                                                  | Cannot rewrite history or weaken approval rules.                   |

The names describe **responsibilities and planned components**, not a claim that every AI role is already operating autonomously.

## What has actually been built?

<details>
<summary>Workflow rules and the history book</summary>

The TypeScript code describes stages, allowed transitions and event records. The journal can store those events in SQLite. It is designed so you can replay events to understand the state of a job.

Relevant code: `src/domain.ts`, `src/journal.ts`, `src/read-only-sqlite-journal.ts`.
</details>

<details>
<summary>Plan approval and review evidence</summary>

There are validators and signature-checking components intended to prove that a human approved **this plan version**, and that a review refers to **this code commit**. Old or mismatched evidence should not be accepted as new approval.

The real-world GitHub identity, signing-key and evidence-retention services still need deployment and integration.
</details>

<details>
<summary>Trusted merge decision</summary>

The code includes a verified merge writer, evidence-checking service, authenticated request handling and Unix socket communication. The idea is that ordinary coding agents ask a narrowly limited service for authorization; they cannot simply write "MERGE_AUTHORIZED" themselves.

Relevant code: `src/verified-merge-writer.ts`, `src/trusted-merge-service.ts`, `src/trusted-merge-request.ts`, `src/authenticated-merge-ipc.ts`, `src/trusted-writer-runtime.ts`, `src/cross-uid-merge-bridge.ts`.
</details>

<details>
<summary>Real Linux permission test — passed</summary>

On **1 November 2026**, a manually triggered GitHub Actions test on Ubuntu 24.04 and Node 24 **passed** on `main`.

It ran the worker, bridge and trusted writer using different Linux identities. The intended worker → bridge → writer path worked. The tested unauthorized socket requests, direct SQLite changes and credential-file reads were rejected.

**[See the successful test run](https://github.com/chrissysemens/AgentFoundry/actions/runs/41333927402).**

This is meaningful evidence for the _tested_ permission boundary, **not** proof that the entire system is secure or ready to merge production code automatically.

The manual test lives in `.github/workflows/manual-cross-uid-isolation.yml`. Its fixture is `scripts/verify-writer-bridge-cross-uid.mjs`. It deliberately uses disposable data and elevated privileges; do not run it against a real project database.
</details>

### What's not built yet?

- An automatic GitHub issue → questions → plan → AI coder → PR → Oracle pipeline.
- A simple installer, dashboard, GitHub App or plug-and-play connection for arbitrary projects.
- Production deployment of the trusted writer, human identity checks, signing keys, secret storage and backup/recovery.
- Full proof against a compromised bridge, stolen credentials, restarts, races or every possible attack.
- A complete real-world demonstration where a human authorizes a merge through the final deployed system.

So **"the security fixture passed" does not mean "Agent Foundry can safely run itself."**

## Why all the security work?

Think of the journal as a notebook that says who gave permission.

If a coding agent can open the notebook and write **"the human said yes"**, all the clever approval rules are pointless.

That is why the design separates:

1. **Workers** that write and review code.
2. **A bridge** that accepts limited requests.
3. **A trusted writer** that owns the private SQLite journal and is supposed to check real evidence before recording permission.

The Linux test shows that, **under the tested setup**, different user accounts and file permissions can stop the untrusted accounts from directly changing the notebook.

It **does not** yet show that a real human approval service is deployed, that secrets cannot leak through other routes, or that the system is safe in every deployment.

**Never give an untrusted agent write access to the journal database or its containing directory.** That would let it bypass the application's checks.

For technical detail, see [SQLite writer isolation](docs/SQLITE-WRITER-ISOLATION.md), [trusted writer authentication](docs/trusted-writer-authentication.md) and [cross-UID fixture notes](docs/WRITER-BRIDGE-CROSS-UID-FIXTURE.md).

## How would I use this with a future product?

The eventual setup should look like this:

```text
Your product repository A ------+
Your product repository B ------+----> Agent Foundry workflow
Your product repository C ------+      (with each project's own rules)
```

Each product keeps its own code, tests and GitHub repository. Agent Foundry supplies the **process** for proposing, checking and authorizing changes.

For each repository, you would eventually configure its permitted maintainers, coding rules, tests, protected branches, agent access and approval requirements. Permissions and evidence must stay correctly scoped to the relevant repository.

**You cannot do that with a one-click setup yet.** This is the goal for the onboarding work.

A sensible first trial will be a disposable or low-risk repository, a small task, ordinary GitHub review, and **no automatic merging**.

## Want to try what's there today?

You need **Node.js 24**, npm and Git.

```bash
git clone https://github.com/chrissysemens/AgentFoundry.git
cd AgentFoundry
npm ci
npm run verify
npm run cli -- demo
```

The demo shows a **simulated** workflow. It does **not** call a real AI model, create a real PR or merge anything. It is useful for seeing the rules work, not for using the finished product.

Useful commands:

| Command                 | What it does                                |
| ----------------------- | ------------------------------------------- |
| `npm run cli -- demo`   | Runs the simulated workflow.                |
| `npm run cli -- --help` | Shows demo CLI options.                     |
| `npm run verify`        | Runs the project's combined quality checks. |
| `npm test`              | Runs automated tests.                       |
| `npm run format`        | Applies Prettier formatting.                |
| `npm run format:check`  | Checks formatting without changing files.   |

There is also a **manual** GitHub Actions workflow called **Manual cross-UID writer isolation gate**. It is restricted to `main`, requires a deliberate trigger and tests a disposable Linux environment. It is not an everyday local demo.

## What we're building next

| Area                    | Where we are                                | What still needs to happen                                            |
| ----------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| **Job workflow**        | Rules, states and tests exist.              | Connect real GitHub issues and AI agents.                             |
| **Questions and plans** | Plan and approval concepts are implemented. | Make the real planner ask questions and produce SIPs.                 |
| **Developer + Oracle**  | Review contracts and checks exist.          | Run genuinely separate coding and reviewing agents.                   |
| **Human permission**    | Verification building blocks exist.         | Connect trustworthy real human decisions and evidence.                |
| **Journal protection**  | A real cross-UID Linux fixture passed.      | Harden and deploy the boundary; test hostile conditions and recovery. |
| **Merge process**       | Restricted authorization components exist.  | Prove the complete deployed authorization-to-merge path.              |
| **Multiple products**   | Designed to be repository-independent.      | Build reusable configuration and onboarding.                          |

**Suggested order:** first make real human approval evidence trustworthy; then harden credentials and the trusted service; then wire a supervised issue-to-PR pilot; finally make onboarding repeatable for other repositories.

## More detailed documents

The README is the **plain-English overview**. The `docs/` folder contains the technical reasoning, protocols and deployment instructions:

- [Oracle review protocol](docs/ORACLE-PROTOCOL.md)
- [Security review handoff](docs/ORACLE-SECURITY-REVIEW-HANDOFF.md)
- [Approval evidence deployment](docs/APPROVAL-EVIDENCE-DEPLOYMENT.md)
- [SQLite writer isolation](docs/SQLITE-WRITER-ISOLATION.md)
- [Trusted writer authentication](docs/trusted-writer-authentication.md)
- [Cross-UID Linux fixture](docs/WRITER-BRIDGE-CROSS-UID-FIXTURE.md)

## License

No license is currently specified. Being able to view a public GitHub repository **does not automatically give other people permission** to redistribute, modify or commercially reuse its code. We need to choose a license before presenting it as reusable open-source software.
