# FOUND-002 — Repair Attempt 1

## Independent Oracle rejection

- **Rejected archive SHA-256:** `4c207be352e9cfcc917fb22ffde764368bfe1db0ea25f7b88dc94872458d8c3b`
- **Initial review verdict:** REJECT
- **Repair attempts:** 1 of 3 (this candidate)

## Remediation

1. Added versioned JSON Schema contracts in `schemas/v1/` for reviews and findings.
2. Added runtime schema validation at the `validateReview` workflow boundary.
3. Added valid and invalid contract test cases, including unsupported versions and absent evidence.
4. Added an explicit Node 24 runtime and SQLite compatibility check.

## Verification

Run on Node 24 with fresh dependencies:

```bash
npm install
npm run format
npm run verify
npm run cli -- --help
```

**Environment limitation:** npm registry access and Node 24 are unavailable in the packaging environment. The lockfile is not yet synchronized with the new dependencies; run `npm install` and include the updated `package-lock.json` in the reviewed revision. These checks have not been executed here. Capture their output on the supported runtime and provide it to the independent Oracle for incremental re-review.

The previous rejection remains part of the audit trail. This package is not an Oracle acceptance or merge authorization.
