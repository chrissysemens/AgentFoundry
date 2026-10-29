# FOUND-002 — Revision 3 prospective revalidation workstream

**Status:** Candidate adopted for revalidation; implementation corrections and fresh Oracle review pending. **No merge authorized.**

## Authoritative identities

| Item | Identity |
| --- | --- |
| Approved SIP | FOUND-002 Revision 3, proposed file on PR #4 |
| SIP commit | `f155b0ad6996d29e75c5c87b9d04c83dd9d5055b` |
| SIP SHA-256 (UTF-8) | `5d89c6ea2da022ce088e9f1330606857b0ef5c7a1d0e74629795f9ccddc45d7e` |
| Historical candidate | `679d6725e46a606804072e75540f78be27300d9e` |
| Revalidation branch | `feat/found-002-r3-revalidation` |
| Approval record | [Issue #1 approval](https://github.com/chrissysemens/AgentFoundry/issues/1#issuecomment-6510682889) |
| Adoption authorization | [Issue #1 disposition](https://github.com/chrissysemens/AgentFoundry/issues/1#issuecomment-6510705728) |

## Historical evidence preserved

Repair Attempts 1 and 2 are historical attempts against the **unapproved** Revision 2 proposal. Their original records and Oracle's **INCONCLUSIVE** finding remain unchanged. Do not relabel them as approved repairs or silently reset their budget. This workstream has not yet assigned a new implementation identity or opened a fresh repair budget. The adoption decision authorizes prospective revalidation, not an automatic counter reset.

## Work packages

1. **Correct documentation authority claims:** `docs/VERIFICATION.md` and `docs/REPAIR-002.md`. Preserve historical statements in Git history and mark corrections clearly.
2. **Approval contract:** exact SIP revision, UTF-8 digest, full Git SHA, UTC approval time, and verifiable human approval provenance. Actor labels alone do not authenticate a human.
3. **Review isolation:** separate read-only Oracle execution, reviewer/provider metadata, independent evidence, no developer private reasoning.
4. **Check provenance:** automated check run IDs/URLs and results must resolve to the reviewed exact code SHA. Unavailable evidence => INCONCLUSIVE, never fabricated success.
5. **Dependency security:** critical/high vulnerabilities block without documented explicit human exception; other findings are triaged.
6. **Regression and audit:** TypeScript-only tests across in-memory/SQLite replay, stale approval/review rejection, budget transitions, independent Oracle checks, and project-agnostic fixtures.
7. **Fresh verification:** Node 24 `npm ci` and `npm run verify`, independent Oracle verdict, and a separate human merge decision.

## Implementation identity decision

A distinct prospective revalidation identity and its repair-budget semantics must be recorded in the journal and audited before any new repair submission. The historical identity/counter must not be overwritten or presented as newly approved. If the proposed event migration changes semantics, surface it for explicit human sign-off rather than treating it as a technical reset.

## Integration boundary

PR #4 contains the approved SIP text but remains unmerged. This branch currently starts from `main`; its PR cannot be declared ready for merge until the approved SIP is present on the intended integration base, the dependency is reconciled, and all independent gates pass. PRs #2 and #3 remain independent drafts.
