# GitHub-backed SIP approval evidence — implementation boundary

**Status:** Design and acceptance criteria; not yet an authenticated production adapter. This document does not authorize a merge.

## Required evidence chain

1. The integration is configured with an explicit GitHub repository and a fixed allowlist of human GitHub numeric user IDs. Neither is accepted from an untrusted journal event.
2. Retrieve the proposed SIP file at the **full approved commit SHA** from the trusted GitHub API. Hash the returned raw UTF-8 bytes and compare to the exact SHA-256 in the receipt and proposed SIP event. Do not use the current branch tip or a rendered Markdown view.
3. Resolve the approval event by repository, issue number and GitHub comment ID via an authenticated GitHub API request. Verify its author numeric ID is allowlisted, its author is not a bot, and its content explicitly binds the SIP revision, commit SHA and digest. Never accept a journal `human:` label as authentication.
4. Treat editable or deleted GitHub comments as insufficient **immutable** approval evidence on their own. A GitHub issue comment may be edited after approval. Require an independently retained append-only/signed attestation, or an equivalent trusted immutable approval event, before returning `VerifiedHumanApproval`. In particular, a comment URL or unchanged `updated_at` value alone does not prove immutability.
5. Verify event timestamps, approval chronology, receipt provenance and the exact source-event identity. Fail closed on missing, ambiguous, revoked, modified, unauthorized or unverifiable evidence.
6. Pass independently verified SIP bytes and human approval identity into `validateSipApprovalReceipt` through the trusted `ApprovalEvidenceVerifier` boundary. The domain reducer must not make network requests or authenticate itself.
7. Keep merge authorization separate: approval of a SIP or an implementation candidate is **not** permission to merge a pull request.

## Tests required before production use

- Correct human, exact SIP bytes, commit and digest: accepted only with independently authenticated immutable event.
- Actor-label spoofing, bot account, wrong user ID, wrong repository, wrong issue or event ID: rejected.
- Edited/deleted comment, unavailable API, invalid signature/attestation or missing independent evidence: rejected.
- Changed SIP bytes, stale branch tip, mismatched full SHA or digest: rejected.
- Replay of SQLite and memory journals with unavailable evidence: fail closed; never synthesize success from stored receipt.

## Current status

The existing `src/sip-approval.ts` validator checks receipt consistency with supplied independently verified evidence. It does **not** authenticate GitHub identities, retrieve immutable approval events or validate attestation signatures. Synthetic test fixtures are not production trust sources. The approved Revision 3 chat and issue records must not be retroactively represented as an immutable GitHub approval attestation.
