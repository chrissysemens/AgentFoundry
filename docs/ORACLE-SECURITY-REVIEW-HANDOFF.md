# Independent Oracle security review handoff

**Scope:** PR #6, `integration/found-002-r3`, compared with `main`.  
**Review target:** resolve and record the _exact full commit SHA at review time_. Do
not reuse an earlier verdict after new commits.  
**Authority:** independent, read-only review. Oracle must not change
implementation or merge.

## Required checks

1. Trace approval identity from authenticated GitHub issue comment through exact-commit SIP bytes, SHA-256 digest, Ed25519 signature, operator key trust and immutable attestation retrieval.
2. Confirm missing, malformed, tampered, revoked or mismatched approval evidence fails closed both for new approval and replay of historical approvals.
3. Inspect `VerifiedApprovalWriter` and all journal construction paths for bypasses. A direct `SQLiteJournal` writer or a separate SQLite connection can append events without independent approval verification; SQLite update/delete triggers do **not** stop inserts, trigger removal, file replacement or privileged DB modification. Document deployment requirements; do not claim this is production-secure by default.
4. Verify concurrency, restart persistence, cross-ticket isolation and forged historical event regression coverage. Assess process-wide and multi-process locking.
5. Review authorization of human actions separately from approval receipts, especially merge authorization. A string actor label alone is not authenticated human consent.
6. Confirm independent Oracle verdict is bound to the exact reviewed code revision and that rejected/inconclusive historical reviews remain unchanged.
7. Review trusted signing-key custody, rotation/revocation, immutable retention/Object Lock, authenticated GitHub API transport, database access controls, recovery and operational audit logging.
8. Confirm no GitHub App access to Mycelium or autonomous merge privileges are enabled as a side effect.

## Evidence to examine

- `src/verified-approval-writer.ts`
- `src/verified-approval-journal.ts`, `src/verified-approval-replay.ts`
- `src/github-readonly-gateway.ts`, `src/verified-github-approval-gateway.ts`
- `src/signed-approval-attestation.ts`, `src/retained-approval-store.ts`
- `src/journal.ts`, `src/domain.ts`, `src/sip-approval.ts`
- `docs/APPROVAL-EVIDENCE-DEPLOYMENT.md`, `docs/ORACLE-PROTOCOL.md`
- SQLite tamper, restart, signed approval integration and writer isolation tests

## Required verdict record

Record reviewed full commit SHA, SIP revision and digest, evidence and CI run
URLs, finding severity and exact paths/lines, remaining deployment blockers,
and one of ACCEPT / REJECT / INCONCLUSIVE under the Oracle protocol. Do not
substitute green CI for independent security review.

**Current known blockers:** no deployed operator-controlled immutable approval
retention; no deployed signer/key custody; no authenticated production GitHub
transport; verified writer not wired into an isolated production runtime; no
independently authenticated merge authorization; no end-to-end Mycelium pilot.

**Historical note:** FOUND-002 Repair Attempt 2 remains INCONCLUSIVE. Rev 3
approval is prospective and is not merge authorization.
