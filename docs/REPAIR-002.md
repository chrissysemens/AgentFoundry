# FOUND-002 — Repair Attempt 2 of 3

## Authority and scope

Independent Oracle REJECTED Repair Attempt 1. This candidate addresses the two medium-severity contract findings only. The then-proposed SIP Revision 2 was unchanged. **Correction (2026-10-30): Revision 2 was never approved**, so this was pre-approval candidate work, not an authorized repair under an approved SIP. No merge was authorized.

## Changes

1. `review.schema.json` now rejects `REJECT` reviews without at least one mandatory-category finding (`sip`, `standard`, or `check`), and rejects `ACCEPT` reviews with `checks_passed: false` or mandatory-category findings. Existing finding schema requires grounded evidence and a rule reference for mandatory findings.
2. `automated_check_refs` is a required, nonempty, unique list of nonempty string identifiers in all review scopes. This is separate from incremental-only `regression_checks`. The field is added to the TypeScript `Review` type, CLI demo, test fixtures, and domain validation. References are identifiers only; verification of their provenance is the responsibility of future integration adapters.
3. Added contract tests for both rejected invalid verdicts, advisory-only rejections, accepted reviews, and missing/invalid automated-check references.

## Verification and independent review

On supported Node 24, run `npm ci`, `npm run format`, `npm run verify`, and `npm run cli -- --help`. Capture exact command output and commit SHA for independent Oracle re-review. This archive was prepared in an environment with Node 22 only; **full Node 24 verification is not claimed**.

Oracle must independently verify the two previously reported findings and check for regressions. Do not merge unless Oracle accepts the exact revision and a separate human authorization is recorded. The npm audit findings from Repair 1 remain to be assessed.
