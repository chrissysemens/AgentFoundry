# Approval evidence deployment contract

This document defines the external trust boundary required before Agent Foundry
may treat a GitHub SIP approval as production-authorized. It does not claim
that this infrastructure is deployed.

## Separate control planes

- GitHub comments are evidence of a proposed approval, not immutable approval
  records. The approval capture service must authenticate the GitHub actor and
  independently verify the SIP contents at the exact Git commit SHA.
- An operator-controlled signer must sign the canonical
  `approvalAttestationSigningBytes` payload with an Ed25519 private key.
  The private key must not be exposed to development agents, PR workflows,
  repository contents, or the journal.
- The signed object must be written once to an external retention-enforced
  store, using the deterministic key
  `sip-approvals/v1/<owner>/<repo>/<comment-id>.json`.
- The store must enforce non-overwrite, non-deletion and a documented
  retention period independently of the application. Storage administrator
  access, retention changes, and revocations require separate audit trails.
- A trusted reader authenticates to the store with read-only credentials.
  `createRetainedApprovalAttestationStore` parses the returned record;
  `verifySignedApprovalAttestation` authenticates the signature; and
  `createVerifiedGitHubApprovalGateway` combines it with GitHub evidence.
  None of these interfaces prove the backend's retention guarantees.
- Trust keys must be configured by the operator outside the repository. Key
  rotation, compromised keys, revocation and replay controls require an
  explicit policy; signature verification alone cannot establish them.

## Capture service acceptance criteria

The capture service must authenticate GitHub actor and issue identity, verify
that the comment was not edited, and retrieve SIP bytes at an exact commit.
The comment must explicitly bind revision, commit SHA, and recomputed digest.
An isolated Ed25519 signer and externally enforced atomic create-only storage
are required. A read-then-write check is not sufficient against concurrency.
Retries must reject conflicting or revoked evidence, and success must require
independent read-back verification. The capture service must not authorize
merges or completion. This is a deployment requirement, not an implemented
service.

## Fail-closed requirements

Missing, malformed, tampered, revoked, stale or cross-repository evidence
must not authorize implementation. The complete approval must be resolved
before the synchronous journal authorization boundary accepts an event.
Never substitute actor labels, GitHub comment text, a branch tip or an
unsigned repository file for independently verified approval.

Merge authorization is a separate human action and must be independently
authenticated. This approval evidence path does not authorize merges.

## Deployment acceptance

1. Provision and audit external immutable retention and key custody.
2. Implement and authenticate the GitHub API transport and approval capture
   service with least-privilege credentials.
3. Establish independent key rotation and revocation controls.
4. Integrate asynchronous resolution into the domain/journal authorization
   path, with end-to-end replay, tampering and missing-evidence tests.
5. Obtain independent Oracle review of the exact candidate commit and verify
   CI/security results on that same commit.

Until these gates are met, this is a tested security foundation, not a
production-ready autonomous approval workflow.
