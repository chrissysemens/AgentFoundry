# FOUND-002 readability pass

This package is a **review candidate**, not an Oracle verdict or merge authorization.

## Changes from the latest user-supplied archive

- Added intentional blank lines in the CLI, journal, and workflow-test helpers.
- Expanded the SQLite initialization SQL into readable statements without changing its schema, indexes, or triggers.
- Wrapped the `ADVISORY_APPROVED` switch branch in a lexical block to satisfy `no-case-declarations`.
- Applied Prettier to the maintained TypeScript files and reviewed the resulting layout.
- Kept the existing SIP, governance logic, and dependency versions.

## Checks in the packaging environment

- `npm run format:check`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm test`: NOT EXECUTED SUCCESSFULLY — the supplied `node_modules` contains macOS binaries, whereas packaging runs on Linux; Rollup's Linux native optional dependency is absent.
- `npm run smoke`: NOT EXECUTED SUCCESSFULLY — the supplied `node_modules` contains a macOS esbuild binary, not the Linux binary.

The user's previous local checks were reported green, but this new package requires fresh verification because its files have changed. No dependencies are included in the ZIP.

## Verify on macOS

```sh
npm ci
npm run verify
```

An independent Oracle must review the exact final revision and verification evidence. A separate human authorization is required for merge.
