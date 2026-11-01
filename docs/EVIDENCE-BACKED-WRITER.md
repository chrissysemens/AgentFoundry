# Evidence-backed trusted writer composition

`runEvidenceBackedTrustedWriter(rawConfig, dependencies)` composes:

1. Strict repository, issue, ticket, path and human allowlist configuration.
2. Writer-only filesystem preflight before privileged SQLite access.
3. Privileged SQLite journal and signed GitHub merge-decision resolver.
4. Independent SIP approval replay through the configured trusted gateway.
5. Minimal `authorize-merge` request handler and authenticated Unix socket.
6. SIGINT/SIGTERM shutdown and journal closure.

The caller **must construct all dependencies inside the trusted process**.
`getGitHub` must use authenticated read-only GitHub API access;
`decisionStore` must enforce independently retained immutable decisions;
`approvalGateway.verifyAttestation` must verify immutable authenticated
attestations. The existing read-only GitHub gateway deliberately returns no
attestation, so it cannot alone make this service authorize a merge.

This is a composition library, **not a production CLI or deployed security
boundary**. A separate trusted executable must securely provision dependencies
and secrets. Existing socket permissions prevent access by different UIDs.
Do not weaken them without peer-authentication design and review.

**Unresolved release blockers:** deployment-enforced SQLite isolation,
cross-UID attack tests, independent evidence-store implementation, restart
and recovery validation, and exact-commit end-to-end tests. Never grant
autonomous merge rights on the strength of this composition alone.
