# FOUND-002 quality remediation — review candidate

## Scope

- Added Prettier and ESLint configuration and mandatory quality commands.
- Restored 17 workflow test cases (eight per adapter and one Oracle interface test); the uploaded `workflow.test.ts` contained only the setup helper.
- Added Node.js 24 pin and GitHub Actions checks.
- Updated engineering contract and README.

## Verification limitations

This build environment could not access the npm registry (`EAI_AGAIN`). New packages could not be installed, the lockfile could not be updated, and the formatting/lint/test/typecheck commands could not be executed here. The uploaded `package-lock.json` is stale relative to `package.json`; **run `npm install` and commit the regenerated lockfile before enabling CI**. Run `npm run format` once, then `npm run verify` on Node 24. Do not treat this candidate as Oracle-approved or merge-ready.

## Review notes

The core workflow source files are not yet automatically Prettier-formatted because Prettier was unavailable. This package is an intermediate remediation candidate, not a passing quality gate. Enable branch protection requiring the `verify` job and human approval separately.
