# Merge authorization: remaining journal trust boundary

## Current state

Ordinary `MemoryJournal.append` and `SQLiteJournal.append` reject
`MERGE_AUTHORIZED`. The `VerifiedMergeAuthorizationWriter` independently
resolves a human decision, replays verified state, and uses
`SQLiteJournal.appendIfLastEventMatches` to reject stale snapshots. Ordinary\nSQLite journal instances now disable that privileged method by default;\ntrusted fixtures can opt in explicitly.

**This is not yet a complete authorization boundary.**
`appendIfLastEventMatches` remains a public method. A caller that can create\na privileged `SQLiteJournal` instance can supply the current last event ID\nand invoke it directly without running the independent decision resolver. SQLite locking\nprevents a stale-snapshot race; it does not authenticate a human decision.\nA process with direct SQLite write access can also INSERT forged events,\nregardless of the journal API or append-only UPDATE/DELETE triggers.\nThe regression test explicitly demonstrates this bypass rather than claiming\nthat application code can block it.

## Required design before production

1. Define a trusted merge-authorization service boundary. Untrusted callers
   must not receive direct write access to the SQLite journal, database file,
   or a generic conditional-append API.
2. The trusted service must obtain independently authenticated, retained human
   decision evidence and replay the journal using verified SIP approvals.
3. Keep the snapshot comparison and merge insert in one SQLite write
   transaction. Reject missing, stale, revoked, or mismatched evidence.
4. Bind the service to operator-managed trusted keys, repository, issue,
   ticket, human identity, exact accepted code revision, and Oracle review.
   Do not treat a caller-provided boolean, callback, symbol, or TypeScript
   visibility modifier as proof of authorization.
5. Ensure operating-system/database permissions prevent untrusted processes
   from opening the SQLite file for writing. Application-level checks cannot
   protect against a caller that already has unrestricted database access.
6. Add end-to-end tests for the trusted service and negative tests showing
   that untrusted callers cannot reach any merge-write primitive. Include
   competing-connection and revoked-evidence cases.

## Release gate

Do not consider this boundary resolved merely because the current tests pass.
Before production use, review the service deployment, evidence retention,
key custody, database permissions, and operator procedures described in
`docs/APPROVAL-EVIDENCE-DEPLOYMENT.md`.

This document records a security limitation; it is not authorization to
merge or deploy.
