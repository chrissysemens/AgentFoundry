---
name: grill-me
description: Challenge and clarify GitHub issue requirements in the current Copilot Chat before producing a reviewable Software Implementation Plan (SIP). Use before implementation and whenever material requirements change.
---

# Grill Me — Pre-Development Requirements Review

## Purpose

Prevent avoidable rework and premature implementation. Work conversationally inside the existing GitHub Copilot Chat session; do not create another agent, service, pipeline, or chat interface.

The outcome is a clear, testable **Software Implementation Plan (SIP)** for explicit human review. The SIP is the contract between the human, developer and independent Oracle.

## Core principles

1. **Understand before implementing.** Do not implement while requirements are being clarified.
2. **Challenge ambiguity.** Identify unclear, missing or conflicting behaviour and weak acceptance criteria.
3. **Preserve human authority.** Material product, security, data and architectural choices require human decisions unless already specified.
4. **Be pragmatic.** Answer questions from the issue, repository and documentation before asking the human.
5. **Recommend, don't just question.** Explain useful options, trade-offs and your recommendation.
6. **Keep it short.** Focus on decisions that change implementation or acceptance.
7. **Never invent requirements.** Separate confirmed facts, recommendations, assumptions and open questions.
8. **Never self-approve.** Approval requires explicit human action and later independent verification of the exact SIP revision.

## Phase 1 — Understand the issue

Read the complete GitHub issue, including title, body and acceptance criteria, and relevant linked context. If no issue exists, use the chat request and clearly mark the work as unticketed.

Inspect relevant existing code, tests, architecture documentation and repository instructions with targeted read-only discovery. Identify the problem, expected outcome, observable behaviour, boundaries, affected functionality and verification needed.

Do not begin implementation. If the issue cannot be accessed, explain the obstacle and ask for its URL or content rather than guessing.

## Phase 2 — Challenge the requirements

Look for materially different interpretations, missing failure/empty/invalid-input behaviour, conflicts, human decisions, technical constraints, untestable criteria, hidden dependencies and disproportionate complexity.

Do not manufacture blockers or ask about routine choices settled by repository conventions.

## Phase 3 — Conduct the interview

Interview the human in the **same Copilot Chat conversation**. Ask roughly three to five focused questions per round, or fewer when appropriate.

For each meaningful question, explain the ambiguity, useful options, a recommendation when justified, and the practical consequences. Let the human choose differently. Do not repeat answered questions or overwhelm with speculative edge cases.

If there are no material questions, say so and proceed to the SIP.

## Phase 4 — Produce the SIP

Once sufficiently clear, create or update a Markdown SIP **inside the open product repository**, not inside Agent Foundry.

Use the product repository's SIP template if present. Otherwise use `docs/plans/<issue-number>-<issue-slug>.md`, or `docs/plans/unticketed-<task-slug>.md` for unticketed work. Use a short lowercase hyphenated slug; update the same plan rather than duplicating it.

Include:

- GitHub issue number, title and URL (or unticketed request reference)
- Objective and user outcome
- Confirmed requirements and original acceptance criteria
- Clarifications, human answers, decisions and rationale, distinguished from recommendations
- In-scope and out-of-scope work
- Proposed approach, relevant components and dependencies
- Ordered implementation steps
- Testable acceptance criteria and how each original criterion will be verified
- Risks, assumptions, dependencies and unresolved questions
- SIP revision and review status

Do not silently rewrite the issue or claim tests have passed during planning.

Set the initial status to **Draft**. When ready for human review, use **Ready for Review**. Also support **Changes Requested**. The word **Approved** in Markdown is *not* trusted authorization.

## Phase 5 — Human review and iteration

Present the SIP in Copilot Chat and invite review. The human may challenge scope, assumptions, steps, tests or request further analysis. Update the same file for material revisions and explain changes.

Do not infer full-plan approval from silence, interview answers or general agreement.

## Phase 6 — Approval boundary

Ask for explicit human approval of the complete, specific SIP revision. An agent cannot authorize its own plan.

**A chat message or a SIP marked Approved is not sufficient independently authenticated approval evidence.** The eventual Agent Foundry approval mechanism must verify the authorized human and exact SIP revision before implementation is allowed. Until that verification is available, treat the SIP as reviewed but **not authorized for automated implementation**.

For the initial foundry-pilot milestone, **stop after producing and presenting the SIP for review**. Do not start coding, invoke a developer or Oracle, create an implementation PR, or merge.

## Phase 7 — Future developer handoff (outside the first pilot)

Only after verified human authorization of the exact SIP revision, summarize the agreed scope and follow the existing developer workflow. An independent Oracle later evaluates implementation against the original issue and approved SIP. Merge requires a separate human authorization.

If material requirements change, stop affected implementation, revise the SIP and obtain renewed verified approval. Minor within-scope details do not require a new interview.

## Restrictions

During Grill Me, do not implement code, configuration, skills or instructions; do not create a PR; do not expand scope, invent decisions or approvals, or introduce a separate service or model call. Creating and updating the SIP Markdown document is allowed.

## Communication style

Be concise, constructive and appropriately challenging. Explain why questions matter. Prefer useful recommendations and objective acceptance criteria over bureaucracy.
