# Agent Foundry

Agent Foundry is a **provider-agnostic workflow and governance engine for AI-assisted software development**. It coordinates implementation work around approved specifications, independent reviews, bounded repair attempts, and explicit human merge authorization.

The current project is a TypeScript/Node.js implementation of the workflow core. It is not yet a hosted agent service or a GitHub issue/PR automation system.

## What it currently includes

- **Workflow domain** (`src/domain.ts`) — state transitions, review rules, and a provider-neutral Oracle interface with a deterministic test implementation.
- **Event journals** (`src/journal.ts`) — in-memory and append-only SQLite implementations for recording and replaying workflow events.
- **Review contracts** (`src/contracts.ts`, `schemas/v1/`) — versioned JSON Schemas and Ajv runtime validation for Oracle reviews and findings.
- **CLI demonstration** (`src/cli.ts`) — exercises the local workflow without contacting an AI provider.
- **Tests and quality checks** (`tests/`, `.github/workflows/quality.yml`) — Vitest, smoke tests, TypeScript checking, ESLint, Prettier, and a GitHub Actions quality workflow.
- **Specifications and guidance** (`docs/`, `AGENTS.md`) — approved implementation plan, repair records, verification guidance, and agent coding standards.

## Requirements

- Node.js **24.x** (see `.nvmrc`; required for built-in `node:sqlite`)
- npm

If you use `nvm`:

```bash
nvm install
nvm use
```

## Setup

```bash
npm ci
npm run verify
```

Run the local CLI:

```bash
npm run cli -- demo
```

Available development commands:

| Command               | Purpose                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `npm run verify`      | Runtime check, formatting, lint, typecheck, tests, and smoke tests |
| `npm test`            | Run Vitest                                                         |
| `npm run smoke`       | Run workflow smoke tests                                           |
| `npm run format`      | Format source and documentation                                    |
| `npm run lint`        | Run ESLint                                                         |
| `npm run typecheck`   | Run TypeScript type checking                                       |
| `npm run cli -- demo` | Run the local demonstration                                        |

## Governance model

Work follows an approved specification (SIP). An independent Oracle issues a structured review verdict; rejected work may enter a limited repair cycle. Oracle acceptance **does not** authorize a merge: human merge authorization is a separate requirement.

See `docs/SIP-FOUND-002-r2.md` for the approved workflow contract and `AGENTS.md` for development conventions.

## Current status

**Early implementation — FOUND-002.** The local workflow engine, journals, schemas, CLI, and tests are present. The current remediation candidate requires independent Oracle acceptance before it can be considered approved.

GitHub ticket pickup, autonomous coding agents, hosted orchestration, MCP integrations, and build-artifact delivery are **not yet implemented**.

## License

No license has been specified yet.
