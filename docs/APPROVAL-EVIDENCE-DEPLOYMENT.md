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

## Separate merge-authorization deployment gate

The merge authorization path is distinct from SIP approval. The
`createGitHubMergeAuthorizationResolver` adapter checks an authenticated GitHub
comment against a `RetainedMergeDecisionReader`, and
`VerifiedMergeAuthorizationWriter` checks the decision against independently
replayed ACCEPTED state. Neither adapter establishes that the retained decision
was genuinely authorized, unmodified, or non-revoked. Do not configure a plain
JSON file, caller-provided callback, or repository content as the trusted
decision source.

Before production use, an independent capture service must:

- Authenticate the GitHub comment and its numeric human author, reject edits,
  and bind the exact repository, issue, comment ID, and timestamp.
- Require a distinct, explicit merge instruction naming the ticket,
  implementation, full accepted commit SHA, and Oracle review ID.
- Retain the complete decision in a separately administered create-only store;
  enforce immutable retention and read-back independently of the agent.
- Cryptographically authenticate the retained record with an operator-held
  signing key and verify it with a separately configured trusted public key.
  Bind the repository and comment ID in the signed bytes to prevent replay.
- Support revocation and signing-key rotation under operator control; fail
  closed when status cannot be established.
- Recheck the current independently verified ACCEPTED state immediately before
  writing. The journal and state verification must share a transactional
  consistency boundary, or the deployment must otherwise prevent concurrent
  external writes and stale-state authorization.
- Keep the underlying journal inaccessible to untrusted callers. In-process
  writer locking alone does not prevent cross-process races.

Acceptance tests must cover signature tampering, unknown and revoked keys,
cross-repository/comment replay, edited comments, mismatched human identities,
stale accepted revisions, revoked decisions, concurrent requests, and failed
storage/identity lookups. A test-only reader is not a production trust source.

**Current status:** The GitHub comment adapter and journal gate exist, with
regression tests for edited/forged comments and writer concurrency. An
authenticated retained-decision verifier, protected deployment, and
transactional cross-process authorization are **not implemented**. No
`MERGE_AUTHORIZED` event should be treated as production-authorized until
these requirements are met.

## Merge decision verification acceptance protocol

A production implementation must use a versioned, domain-separated Ed25519
signature over a deterministic serialization containing **all** of:

- Protocol version and purpose (merge authorization, never SIP approval).
- Repository owner/name, GitHub issue number, and comment ID.
- Numeric authenticated GitHub author ID and original comment timestamp.
- Ticket ID, implementation ID, full 40-character accepted commit SHA, and
  independent Oracle review ID.
- Operator signing-key identifier outside the signed payload, resolved only
  against an independently configured trust policy.

Verification must reject extra or ambiguous representations of signed fields,
unknown signing keys, signatures with the wrong purpose, altered payloads,
replayed evidence from another repository or comment, and decisions that have
been revoked. A valid signature is **necessary but not sufficient**: the
independent retention reader must establish record identity and current
revocation status, and the authenticated GitHub reader must still establish
the comment's author and unedited content. Neither an arbitrary
`RetainedMergeDecisionReader` nor a successful signature check alone proves
these properties.

Before enabling the writer in production, exercise a full end-to-end test
against a real external retention backend and isolated signer, including
key rotation and revocation, simultaneous writers in separate processes,
a state change between review and append, and an interrupted append/retry.
Record the exact commit, CI results, and independent Oracle verdict. Fail
closed if any of these checks cannot be performed.
