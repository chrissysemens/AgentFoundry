# SIP-FOUND-002 — Independent Oracle and Bounded Repair Loop

**Revision:** 3  
**Status:** PROPOSED — AWAITING EXPLICIT APPROVAL  
**Ticket:** FOUND-002
**Change type:** Prospective governance revision; not retroactive approval of earlier implementation.  
**Approval required:** Explicit human approval of this exact revision before implementation.

## 1. Objective

Implement a TypeScript/Node.js version of the Foundry event-sourced workflow, using the Python v0.2/v0.3 implementations only as behavioral references, and extend it with an independent, evidence-based Oracle review contract, bounded repair workflow, escalation, and human-only merge authorization. Preserve provider, ticketing, and storage independence in the domain core.

## 2. Decisions carried forward from Revision 2

1. Oracle may reject violations of the approved SIP, established mandatory standards, or required checks. Issues outside those obligations are advisory and require human judgment to block.
2. Original review is **not** a repair attempt. Permit **up to three repair submissions**, each independently reviewed; then escalate if still rejected. Stop early for a defective SIP or redesign.
3. Repairs receive incremental review of changed code, outstanding findings, affected paths, and automated regression evidence. A justified full review is allowed.
4. Oracle acceptance does **not** merge: every merge requires explicit human approval.
5. Inconclusive review or provider failure escalates immediately; no automatic retry and no repair attempt consumed.
6. Oracle runs in isolated context; its model/provider is independently configurable. Do not provide developer private reasoning.
7. Advisory findings generate _proposed_ backlog items, not active tickets; deduplicate and require human approval.
8. Every blocking finding must include violated requirement/standard, affected code location, evidence, severity, and a verifiable resolution criterion.

## 2A. Architecture decision — implementation language

- **Foundry core and CLI:** TypeScript on Node.js, with strict TypeScript compiler settings.
- **Tests:** Vitest; test commands and setup documented for a TypeScript developer.
- **Local persistence:** SQLite behind a repository/journal interface; in-memory adapter for domain tests. The SQLite driver is an adapter-level choice, not a domain dependency.
- **Contracts:** Versioned JSON Schema, provider-neutral and consumable from other languages.
- **Downstream projects:** May use any language, framework, or toolchain. Foundry's orchestration core remains TypeScript/Node.js; project-specific toolchains do not become Foundry runtime dependencies.
- **Future integrations:** Claude, Codex, GitHub, other tools via adapters; no live provider required in this ticket.
- **Python reference:** The existing Python prototype is not the production baseline and will not be merged as the Foundry implementation. Port behavior and acceptance tests, not Python modules.

## 3. Scope

### Included

- Pure-domain review and repair state transitions and immutable review identity.
- Structured Oracle review schema and validation, including verdict, evidence, advisory findings, and review scope.
- Provider-neutral Oracle invocation interface and deterministic fake for tests (no live AI integration).
- Durable repair budget tied to the implementation attempt and approved SIP identity.
- Immediate escalation for inconclusive review, defective SIP, exhausted repair budget, or policy failure.
- Explicit human merge authorization event; Oracle acceptance alone is insufficient.
- Proposed backlog items from advisory findings, with approval state and duplicate detection.
- TypeScript SQLite journal adapter, in-memory journal adapter, replay tests, CLI demonstration, documentation.
- TypeScript project scaffolding (`package.json`, lockfile, `tsconfig.json`, Vitest config), repeatable setup, and a documented Node.js LTS requirement.

### Excluded

- Real Claude/Codex API calls, autonomous cloud workers, GitHub/Azure integrations, actual PR merges, notifications, deployment, School automation, and production identity/authentication.
- A general-purpose token metering/billing service. Only bounded operations and recorded usage metadata where supplied.

## 4. Contracts and invariants

- **SIP identity:** revision plus SHA-256 content digest of the exact UTF-8 SIP file bytes at the approved Git commit. Changes invalidate prior approval and require a new approval.
- **Approval evidence:** before implementation, record the approver's explicit decision, UTC timestamp, full SIP SHA-256 digest, SIP revision, and full Git commit SHA in an append-only auditable record. An agent's assertion or an unrelated conversation summary is not proof of approval; the approval event must be verifiable and attributed to the human approver.
- **Implementation identity:** stable ID associated with the approved SIP. Branch, PR, session, or worker restarts cannot reset the repair counter.
- **Review evidence:** review ID, implementation ID, SIP identity, full code/diff commit SHA, reviewer identity and provider/model configuration (where available), scope, automated-check run IDs/URLs and observed outcomes tied to the exact SHA, verdict, findings, and timestamp.
- **Oracle independence:** reviewer executes in a distinct context from the implementer with read-only implementation access; cannot edit source, tests, or evidence or approve a merge. A different agent label alone is insufficient. Unavailable independent execution or unverifiable evidence requires INCONCLUSIVE.
- **Verdicts:** ACCEPT, REJECT, INCONCLUSIVE. `REJECT` requires at least one valid blocking finding. `INCONCLUSIVE` requires an escalation reason. Advisory findings cannot alone produce REJECT.
- **Blocking finding:** stable finding ID, category, severity, rule/acceptance-criterion reference, file/line or other grounded location, evidence, and measurable resolution condition.
- **Review scope:** INITIAL_FULL, INCREMENTAL, or JUSTIFIED_FULL; incremental includes changed files, outstanding findings, affected paths, and regression-check references.
- **Repair counting:** increment only when a repair is submitted for Oracle review, not when coding starts or an Oracle invocation fails. After the third rejected repair review, escalate; never schedule a fourth.
- **Escalation:** preserve current evidence and reason, halt automatic work, await explicit human instruction. Replanning requires a new SIP revision and approval; do not silently reset budget under the same approved SIP.
- **Merge gate:** accepted review + required checks + explicit human merge approval bound to the exact accepted code revision. Any subsequent code change invalidates merge approval.
- **Dependency security:** a critical or high-severity known dependency vulnerability blocks acceptance unless a documented, scope-limited exception is explicitly approved by the human owner after risk assessment. Moderate and lower vulnerabilities require recorded triage and disposition. A green test workflow is not a security waiver.
- **Authority:** actor labels in v0.2 are not authentication. Clearly document this limitation; enforce domain checks while leaving verified identity to future integration adapters.
- **Audit:** all state-changing decisions append journal events; replay reconstructs the same state. No database-specific logic in the reducer.

## 4A. Pre-approval implementation discovered during review

The human owner confirmed that SIP Revision 2 was **not approved** before the existing TypeScript candidate was produced. That candidate and its Repair 1/2 records remain historical, auditable evidence, not approved implementation. No retrospective approval, acceptance, or merge is implied by this revision.

After explicit approval of this Revision 3, first conduct a **fresh baseline assessment** of the existing candidate against the newly approved SIP and mandatory checks. The human owner must then explicitly choose whether to reuse the candidate through a documented adoption/revalidation path or commission a fresh implementation. Record the choice, rationale, and new implementation identity. Do not silently reset, reuse, or relabel the earlier repair budget; preserve historical attempts, and establish any new budget only through the approved, recorded transition. Oracle's historical INCONCLUSIVE verdict stays intact.

## 5. Proposed implementation sequence

1. **Approval and candidate disposition:** record explicit Revision 3 approval identity; assess the pre-approval candidate and obtain a human decision on documented adoption/revalidation versus fresh implementation. Then perform baseline and correction: inspect the Python reference behavior and tests; scaffold the TypeScript project and port the foundational state machine. The current `IMPLEMENTATION_STARTED` increments `attempts` and caps at 3, which effectively allows only two repairs. Replace with distinct initial implementation and repair-submission semantics, preserving replay compatibility or documenting an explicit event migration.
2. **Contracts:** add versioned Oracle review and finding JSON Schemas, TypeScript types and runtime validation, and sample valid/invalid reviews.
3. **Domain workflow:** add events and transitions for review outcomes, repair requests/submissions, escalations, advisory proposals, and merge authorization; protect against stale review/code identities and counter resets.
4. **Oracle port:** define a narrow interface accepting an approved SIP, current diff/code identity, test results, mandatory standards, and previous findings. Add fake implementation for deterministic testing; keep developer private reasoning out of the request contract.
5. **Persistence and CLI:** implement a TypeScript SQLite append-only adapter without embedding SQL in core. Demonstrate create/review/reject/repair/accept/merge-approval and escalation paths.
6. **Docs and validation:** update workflow diagrams, examples, agent instructions, and tests; present evidence in PR.

## 6. Acceptance tests (minimum)

- A SIP without approval cannot start implementation or review.
- SIP approval is bound to the exact UTF-8 file digest, full Git SHA, human identity, and UTC timestamp; changed content invalidates it.
- Existing pre-approval implementation cannot become approved retroactively; adoption requires an explicit human decision, documented baseline assessment, and preserved historical repair records.
- Oracle must be independent of the implementer, read-only, and able to cite exact-SHA CI results; missing evidence produces INCONCLUSIVE.
- Critical/high dependency vulnerabilities require remediation or a documented, explicit human exception; other findings are triaged.
- Initial Oracle rejection permits repair #1, #2, and #3; a rejection after repair #3 escalates. No repair #4 is accepted.
- Oracle failure/inconclusive outcome escalates without incrementing repair count or retrying.
- Defective SIP or substantial redesign escalates directly to replanning.
- Review REJECT with no cited mandatory rule or no supporting evidence is invalid.
- Advisory-only findings cannot block; proposed tickets are inactive until human approval; duplicates are handled.
- Incremental review records changed code, unresolved findings, affected paths, and regression checks; justified full review records rationale.
- Oracle cannot approve merge; accepted PR still requires explicit human merge authorization tied to current code revision.
- Stale review, stale merge authorization, and changed SIP content cannot authorize later work.
- Restart/replay and branch/PR/session identity changes do not reset repair budget.
- Same domain tests pass with TypeScript in-memory and SQLite journal implementations.
- `npm ci`, `npm test`, `npm run typecheck`, and `npm run cli -- --help` work from a clean checkout on the documented supported Node.js version.
- No Python runtime, Python test framework, or Python package dependency is required for the Foundry application or tests.
- No live model, ticketing service, or network connection required to run tests.

## 7. Token and operational controls

- Maximum three repairs is a hard ceiling, not a goal.
- No scope expansion in a repair without replanning approval.
- No automatic retry on inconclusive review, provider outage, or insufficient evidence.
- Incremental review by default on repairs; full review requires documented justification.
- Record optional model usage/cost metadata when supplied; never depend on a specific provider's billing API.
- Avoid generating replacement code in Oracle findings; Oracle diagnoses, Developer repairs.

## 8. Risks and mitigations

- **False independence:** separate context is not a guarantee of unbiased review; maintain isolated inputs and objective checks.
- **Identity spoofing:** local actor labels are not secure; do not claim production-grade authorization.
- **Review drift:** bind findings and approvals to exact SIP and code revisions.
- **Counter ambiguity:** distinguish initial review from three repair reviews; explicitly test the boundary.
- **Unbounded costs:** enforce repair ceiling, no automatic provider retries, and human escalation.
- **Overgrown backlog:** proposals are deduplicated and require human acceptance.

## 9. Revision history and change control

- **Revision 1:** Eight governance decisions approved; Python prototype implemented but not merged.
- **Revision 2:** Changes implementation language to TypeScript/Node.js and testing to Vitest; makes a full TypeScript port of the core and storage adapters part of scope. All eight governance decisions, authority gates, and three-repair ceiling remain unchanged.
- Revision 1 approval did **not** authorize the Revision 2 TypeScript implementation. The human owner confirmed Revision 2 was not approved; the existing code is a pre-approval candidate.
- **Revision 3 (proposed):** specifies prospective handling of that candidate, exact approval evidence, reviewer independence, SHA-linked CI evidence, dependency-security policy, and project-agnostic downstream language support. Revision 3 requires its own explicit approval.

## 10. Delivery and sign-off

Deliver code changes as a reviewable PR or patch, updated documentation, machine-readable contracts, passing tests, and a demonstration transcript. Oracle acceptance is separate from human merge approval.

**Approval request:** Approve **SIP-FOUND-002 Revision 3** as written, or request edits. Approval authorizes implementation only; it does not authorize merging.
