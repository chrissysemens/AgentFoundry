# Signed SIP evidence gateway integration

`createSignedSipApprovalGateway` combines authenticated GitHub comment and
commit-pinned SIP reads with independent Ed25519 attestation verification.
The `verifyAttestation` method rejects modified signatures and unknown or
revoked signing keys; absent records remain absent and cannot approve a SIP.

Provision the store and trusted public keys inside the protected writer
process. The filesystem-backed store is only protected from tampering when
OS-level ownership and directory permissions are enforced. Do not load
trusted keys or select evidence from an IPC request.

The caller may supply this gateway as the `approvalGateway` dependency to
`runEvidenceBackedTrustedWriter`. This change does not instantiate the
writer, provision credentials or prove cross-UID filesystem isolation.
It does not resolve the SQLite direct-SQL bypass; autonomous merging
remains disabled.
