# Agent Foundry

**A GitHub-native foundation for a supervised AI software-development team.**

Agent Foundry is designed to take a software change from a GitHub issue through clarification, a human-approved plan, implementation, automated checks, independent review and a separately authorized merge. The central rule is simple: **agents can propose and evaluate changes; people retain control over scope and merging.**

> **Project status — November 2026:** The TypeScript workflow engine, journals, approval and signed-evidence verification, trusted merge authorization components, Unix-socket transport and authentication primitives have been implemented with tests. **Agent Foundry is not yet a turnkey autonomous coding service or production-ready merge system.** The isolated writer deployment, real agent orchestration, external evidence infrastructure and project onboarding remain unfinished. In particular, the direct-SQL authorization bypass is **not closed** until OS-enforced database isolation is deployed and verified.

Agent Foundry is a separate project from **Mycelium**, an audio-plugin project that may become an early supervised integration. There is no active autonomous Mycelium integration today.

## Contents

- [What Agent Foundry is for](#what-agent-foundry-is-for)
- [The end-to-end workflow](#the-end-to-end-workflow)
- [Roles and responsibilities](#roles-and-responsibilities)
- [Architecture and components](#architecture-and-components)
- [Security and trust model](#security-and-trust-model)
- [Getting started locally](#getting-started-locally)
- [Integrating another repository](#integrating-another-repository)
- [Using Agent Foundry in practice](#using-agent-foundry-in-practice)
- [Testing and development](#testing-and-development)
- [Current limitations and roadmap](#current-limitations-and-roadmap)
- [Documentation and license](#documentation-and-license)

## What Agent Foundry is for

A conventional AI coding assistant can generate a patch. Agent Foundry aims to coordinate the **whole change-management process** around that patch: clarify the request, establish an approved specification, retain auditable evidence, keep implementation and review independent, and prevent a code change from silently becoming a merge.

Its intended properties are:

- **Human-defined scope:** a person approves a specific Software Implementation Plan (SIP), not an open-ended instruction.
- **Traceability:** the journal records workflow events; approval and review evidence is bound to specific revisions and commits.
- **Separation of duties:** the implementation agent does not act as its own independent Oracle reviewer.
- **Bounded repair:** a rejected implementation can be revised within the workflow's repair limit rather than looping indefinitely.
- **Fail-closed decisions:** missing, stale, mismatched, revoked or untrusted evidence should block privileged authorization.
- **Explicit merge control:** approving a SIP or receiving an Oracle ACCEPT is not the same as authorizing a merge.
- **Project portability:** the intended integration point is a repository and its policies, not a single AI model or one particular application.

This is an **engineering foundation under development**, not a hosted product or a drop-in GitHub App.

## The end-to-end workflow

The following is the **target user experience**. The repository currently implements important state transitions, validators and evidence checks, but it does **not** yet orchestrate every step automatically.

| Step | Stage | Purpose | Gate or result |
| --- | --- | --- | --- |
| 1 | **Issue created** | A human describes a bug, feature or maintenance task in GitHub. | A ticket becomes the unit of work. |
| 2 | **Grill Me** | The planner asks clarifying questions, identifies constraints and surfaces missing acceptance criteria. | The request is sufficiently specific to plan. |
| 3 | **SIP proposed** | The planner writes the Software Implementation Plan: scope, non-goals, risks, implementation outline and tests. | A concrete, versioned plan exists. |
| 4 | **SIP approved** | An authorized human approves that exact SIP revision, content digest and associated Git revision. | The approved scope is fixed; later changes need fresh approval. |
| 5 | **Implementation started** | A developer agent works in an isolated branch against the approved plan. | Proposed code and tests are produced. |
| 6 | **PR and CI** | The implementation is submitted for review; formatting, lint, types, tests and other project checks run. | The candidate commit is identifiable and checks are recorded. |
| 7 | **Oracle review** | An independent reviewer compares the exact candidate commit with the approved SIP and reports an ACCEPT or findings. | Rejection returns to a bounded repair cycle; the Oracle does not silently patch its own subject. |
| 8 | **Human evaluation** | A person can inspect the PR, test behavior and reject or request adjustments. | Functional acceptance is distinct from automated CI. |
| 9 | **Separate merge authorization** | An independently authenticated human decision is verified against the ticket, commit, review and trusted evidence. | Only a privileged trusted writer may record `MERGE_AUTHORIZED`. |
| 10 | **Merge and retention** | A separately authorized GitHub merge operation can proceed; journal and evidence are retained. | Auditable outcome and lessons for later work. |

**Critical distinction:** a SIP approval, green CI, Oracle ACCEPT and merge authorization are **four different things**. None implicitly grants the others.

### Example: a feature in another project

A maintainer opens an issue: “Remember the last selected preset after reopening the application.” Grill Me establishes whether the preference is global, per project or per user. The planner proposes a SIP covering persistence, migration and tests. The maintainer approves that precise plan. An implementation agent proposes a PR; CI runs; the independent Oracle reviews the candidate commit. The maintainer tests it and, **only if satisfied**, separately authorizes the merge.

Today you can demonstrate the **workflow engine** locally. Automatic issue pickup, agent execution, real PR creation and merge orchestration are future integration work.

## Roles and responsibilities

| Role | Responsibility | Must not do |
| --- | --- | --- |
| **Human maintainer** | Set priorities, answer questions, approve SIP revisions, test changes and separately authorize merges. | Have a vague “looks good” interpreted as unconditional merge permission. |
| **Grill Me / planner** | Turn an ambiguous issue into a specific SIP with acceptance criteria. | Treat an unapproved revision as approved. |
| **Developer agent** | Implement the approved change, add tests and submit a candidate PR. | Forge human approvals, write privileged merge events or self-certify an independent review. |
| **Oracle** | Independently assess the implementation against the approved SIP and exact commit; report findings. | Quietly modify the code being judged or reuse a verdict for a different commit. |
| **Trusted authorization service** | Verify independently sourced human and review evidence before recording merge authorization. | Accept caller-supplied actor, ticket or evidence as authoritative. |
| **GitHub merge resolver** | Verify valid authorization before invoking GitHub's merge API. | Write the authoritative journal or assume a string actor name proves identity. |
| **School** | Preserve lessons and propose improvements to future work. | Rewrite history or silently relax approval rules. |

**SIP** means Software Implementation Plan. **Oracle** is the independent review role. **Journal** is the event history. **PR** means pull request. **CI** means continuous integration.

## Architecture and components

The repository is built with **TypeScript**, **Node.js 24**, **Vitest**, **SQLite** and GitHub-oriented evidence interfaces.

### Workflow model and journal

- `src/domain.ts` contains the workflow model, event reduction and relevant validation logic.
- `src/journal.ts` implements an in-memory journal and a SQLite-backed event journal.
- Events are replayed to derive state. The SQLite journal uses transactions and update/delete triggers, but those triggers **do not prevent direct SQL INSERTs** by someone with write access.
- `src/read-only-sqlite-journal.ts` provides a read-only journal consumer for processes that should not have privileged write capabilities.

### Human approval and signed evidence

Approval verification is designed to bind a human's decision to a particular ticket, SIP revision, Git revision and content digest. The code includes GitHub evidence adapters, Ed25519 signature verification, trusted-key policy and independently verified replay paths.

These are **interfaces and tested components**, not a claim that production signing keys, immutable evidence retention, GitHub credentials and revocation operations have already been deployed.

### Oracle and implementation review

Oracle review records include the implementation identifier, SIP revision and digest, candidate code revision, verdict, findings and automated-check references. Review of an older commit must not be silently treated as approval of a newer one. Rejected work follows the bounded repair policy.

### Trusted merge authorization

- `src/verified-merge-writer.ts` enforces trusted merge authorization conditions and conditional append semantics.
- `src/trusted-merge-service.ts` composes trusted evidence resolution and verified journal replay.
- `src/trusted-merge-request.ts` exposes a narrow `authorize-merge` operation; callers cannot choose the trusted ticket, actor or authorization payload.
- `src/isolated-merge-ipc.ts` provides a bounded Unix-domain socket request transport.
- `src/trusted-writer-filesystem.ts` checks startup file ownership and permissions on Linux.
- `src/trusted-writer-runtime.ts` provides socket runtime startup and shutdown.
- `src/authenticated-merge-ipc.ts` validates a strict authenticated request envelope before calling the trusted handler.

**These pieces do not yet constitute a production-deployed, isolated writer daemon.** Socket permissions and a shared secret alone do not prove OS peer identity or prevent a process with SQLite write access from forging events.

### Supporting project material

- `docs/` contains the Oracle protocol, evidence and security guidance, deployment contracts and review handoffs.
- `tests/` contains workflow, authorization, evidence and regression tests.
- `scripts/` contains runtime and deployment checks, including a cross-UID SQLite mutation probe.
- `src/cli.ts` runs a local simulated workflow demonstration.
- GitHub Actions and npm scripts provide project quality checks.

## Security and trust model

Agent Foundry treats **merge authorization as a privileged operation**, not just another event a worker can emit.

1. **Exact binding:** approval and review evidence must match the intended ticket, plan and candidate commit.
2. **Independent evidence:** trusted authorization re-resolves authenticated human decisions and verifies signed evidence; a worker's claims are not sufficient.
3. **Atomicity:** the verified SQLite writer compares the expected last journal event and appends within a `BEGIN IMMEDIATE` transaction to reject stale authorization attempts.
4. **Least privilege:** untrusted workers, Oracle processes and GitHub merge resolvers must not share writable access to the authoritative SQLite database or its directory.
5. **Separate human decision:** implementation acceptance and merge permission are distinct.
6. **Fail closed:** invalid, unavailable or stale evidence must not authorize a merge.

### Known unresolved security boundary

**The direct-SQL bypass is still unresolved at deployment level.** An untrusted process that can write the SQLite file or its parent directory can bypass application-level guards and forge a `MERGE_AUTHORIZED` event. The repository has regression tests, filesystem preflight checks, IPC transport and authentication primitives, but **OS-enforced writer isolation and deployment negative tests are still required**.

Before any production autonomous merge capability is enabled, deploy a separately provisioned trusted writer under its own non-root identity; protect the SQLite file, directory, WAL and SHM files; authenticate and authorize permitted clients; secure credentials and backups; and test direct SQL attacks using the actual worker and resolver identities. See [SQLite writer isolation](docs/SQLITE-WRITER-ISOLATION.md) and [trusted writer authentication](docs/trusted-writer-authentication.md).

Do **not** expose the authoritative SQLite database to untrusted containers, mount it read-write in worker processes, or interpret a successful local unit test as proof of infrastructure isolation.

## Getting started locally

### Requirements

- **Node.js 24** (the package declares `>=24 <25`).
- npm and Git.
- A local clone of this repository.

```bash
git clone https://github.com/chrissysemens/AgentFoundry.git
cd AgentFoundry
npm ci
npm run verify
npm run cli -- demo
```

The demo uses **simulated approval evidence** and a local SQLite journal (in memory by default). It prints the workflow progression through an Oracle ACCEPT and explains that a separate human merge authorization is still needed. **It does not contact an AI model, create GitHub issues or PRs, or merge code.**

To see CLI help:

```bash
npm run cli -- --help
```

You can optionally supply a **disposable local demo database path**:

```bash
npm run cli -- demo ./foundry-demo.sqlite
```

Do not point the demo at a production journal or reuse a database containing the same demo ticket.

## Integrating another repository

Agent Foundry is intended to sit **alongside** the project it works on. Your application remains in its own GitHub repository; Foundry supplies workflow policy, agent coordination and verification.

### Intended integration path

1. **Choose a pilot repository.** Start with a noncritical task in a separate development or test environment. Do not grant autonomous production merge permission.
2. **Define repository policy.** Specify allowed maintainers, protected branches, SIP template, Oracle review requirements, CI checks, repair limits and human testing expectations.
3. **Provision GitHub access.** Eventually use a narrowly scoped GitHub App or equivalent with only the permissions needed to read issues, create branches and PRs, and observe checks. Keep merge credentials separate and more tightly controlled.
4. **Configure evidence trust.** Establish authenticated GitHub reads, trusted signing public keys, revocation rules, independently retained decision records and a clear ticket/repository identity binding.
5. **Deploy isolated authorization infrastructure.** Run the trusted writer under a separate OS identity with private database storage and independently authenticated client access. Validate cross-UID denial of direct SQLite writes before allowing privileged operations.
6. **Connect agent execution and Oracle review.** Supply a planner, implementation runner, test execution environment and genuinely independent reviewer. **The repository does not yet provide a turnkey adapter or configuration file that completes this step.**
7. **Run a supervised issue-to-PR pilot.** Approve a specific SIP, inspect the generated PR, confirm CI and Oracle evidence on the exact commit, perform human testing and separately authorize any merge.
8. **Expand gradually.** Add repositories and autonomy only after auditing the pilot and documenting operational recovery, secrets, backups and incident handling.

### What you can integrate today

You can **clone and evaluate** the workflow model, journals, approval verification, trusted merge service and socket primitives in your own Node.js/TypeScript experiments. You can run the CLI demo and tests. You **cannot yet install Agent Foundry into an arbitrary GitHub project and expect autonomous issue-to-PR execution**.

There is currently no published npm package, one-command installer, complete GitHub App onboarding flow, hosted service or stable public integration API. The package is marked `private`. Avoid treating internal TypeScript imports as a versioned SDK contract.

### Suggested first pilot

For Mycelium or any other project, start with a small documentation or low-risk test improvement. Keep PR creation supervised, protect the default branch, require normal repository CI and human review, and leave automated merging disabled. A passing pilot should demonstrate **traceable evidence and correct refusal paths**, not merely that a code patch was generated.

## Using Agent Foundry in practice

**Today:** run the demo, inspect the event model and tests, review the security contracts, and build or test an integration against a disposable repository. Use GitHub PR review as normal.

**When orchestration is implemented:** the maintainer will open an issue, answer Grill Me questions, approve a SIP, and receive a candidate PR with CI results and an independent Oracle verdict. They will test the result and give a **new, explicit merge decision**. The trusted service must verify that decision and its exact-commit evidence before any merge resolver can act.

If the SIP changes, the candidate commit changes, evidence expires or is revoked, or Oracle rejects the work, the system should **stop and request the appropriate new approval or repair** rather than silently continuing.

## Testing and development

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run smoke
npm run verify
```

`npm run verify` checks the required Node runtime, formatting, lint, TypeScript, tests and smoke run. Use `npm run format` to apply Prettier formatting locally before committing.

For security-sensitive changes, additionally require a current CI result and independent review of the **exact final commit**. Do not infer a new Oracle ACCEPT from an older review.

The cross-UID deployment probe at `scripts/verify-sqlite-uid-isolation.mjs` intentionally attempts database mutation, rename and deletion. **Run it only on a disposable Linux test database and volume, never against production data.** Its passing result is only one part of deployment acceptance.

## Current limitations and roadmap

| Area | Current state | Remaining work |
| --- | --- | --- |
| Workflow and event model | Implemented with automated tests | Real orchestration and operational integration |
| SIP and approval evidence | Validation, signatures and replay components | Production GitHub identity, keys, storage and revocation |
| Oracle review | Protocol, schemas and workflow rules | Independent agent execution and exact-commit operational evidence |
| Merge authorization | Verified writer, service and request validation | Fully provisioned trusted service and independently verified deployment |
| IPC | Unix socket runtime and authenticated envelope | Authorized cross-UID client access, peer identity and rotation |
| SQLite isolation | Preflight and negative-test tooling | OS/container isolation enforcement and real deployment attack tests |
| Project onboarding | Design and documentation | GitHub App/configuration, adapters and guided setup |
| End-to-end automation | Target workflow specified | Issue intake, planner, coder, CI, reviewer and PR orchestration |
| Mycelium integration | Candidate future pilot | Narrowly scoped access and supervised end-to-end trial |

### Near-term priorities

1. Finish the deployable trusted writer, caller authentication and OS-enforced SQLite isolation.
2. Prove the boundary using actual cross-process identities, negative tests, restart/race tests and independently reviewed evidence.
3. Wire a supervised GitHub issue-to-PR pilot with explicit SIP and merge approval gates.
4. Improve reusable onboarding, documentation and project integration before expanding autonomy.

The aim is not to remove humans from software development; it is to **reduce repetitive implementation work while making accountability and safety explicit**.

## Documentation and license

Start with [Oracle protocol](docs/ORACLE-PROTOCOL.md), [security review handoff](docs/ORACLE-SECURITY-REVIEW-HANDOFF.md), [approval evidence deployment](docs/APPROVAL-EVIDENCE-DEPLOYMENT.md), [SQLite writer isolation](docs/SQLITE-WRITER-ISOLATION.md) and [trusted writer authentication](docs/trusted-writer-authentication.md).

**License:** No license is currently specified. Until a license is added, others can read the public repository, but should **not assume they have permission to redistribute, modify or commercially reuse the code**. A deliberate license decision is required before presenting Agent Foundry as a reusable open-source project.
