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

### Track decisions throughout the interview
Maintain a lightweight working decision record within the current Copilot Chat context. Track three distinct categories:

- **Confirmed decisions:** Requirements and choices explicitly stated or accepted by the human, including relevant constraints and defaults.
- **Outstanding questions:** Material ambiguities that still require human input.
- **Proposals and assumptions:** Agent recommendations or implementation assumptions that have not been explicitly confirmed.

Before each interview round, consult this record. Do not repeat resolved questions or contradict confirmed decisions unless new information creates a genuine conflict. If a conflict arises, explain it and ask the human to resolve it.

When the human answers a question, update the record and remove resolved questions from the outstanding list.

Before producing or revising the SIP, reconcile its requirements against the decision record. Preserve confirmed decisions accurately, distinguish unconfirmed assumptions, and identify any unresolved material questions.

Keep this record in the existing conversation; do not create a separate tracking file or require the human to maintain it.

Before asking the human anything, identify the outstanding material questions and group related questions into a single interview round.

Ask approximately three to five focused questions together, or fewer if fewer material decisions remain. Do not ask one question per message when several known questions could reasonably be answered together.

After each response, incorporate the human's answers, reassess what remains unresolved, and either present the next grouped round or proceed to the SIP.

Do not prolong the interview for routine implementation details. Record non-material assumptions in the SIP instead.

## Phase 4 — Produce the SIP

Every material requirement or decision in the SIP must be clearly classified as one of:
- Original requirement: Explicitly stated in the GitHub issue or its linked authoritative context.
- Human-confirmed decision: Explicitly agreed during Grill Me.
- Agent proposal or assumption: Recommended by the agent but not yet confirmed.
- Open question: A material decision still awaiting human input.
Never present an agent recommendation as a human-confirmed decision. Human review of the SIP does not automatically convert every proposal into a confirmed requirement.

Before presenting the SIP, check that these classifications are consistent with the interview.

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

Set the initial status to **Draft**. When ready for human review, use **Ready for Review**. Also support **Changes Requested**. The word **Approved** in Markdown is _not_ trusted authorization.

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
