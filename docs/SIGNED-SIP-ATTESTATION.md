# Signed SIP approval attestation verification

`verifySignedSipApprovalAttestation` authenticates independently retained
SIP approval evidence using operator-configured Ed25519 public keys. It
validates the complete repository/comment binding, author, SIP revision,
full commit SHA, SHA-256 digest, approval timestamp and strict field shape.
It rejects revoked or unknown signing keys, modified payloads and invalid
signatures.

The signing payload is domain-separated with
`agent-foundry-sip-attestation-v1`. A trusted capture service must authenticate
the original GitHub event, validate the source, sign the exact payload and
retain it immutably **before** the writer may rely on it.

This PR adds the cryptographic verifier and negative tests. It does **not**
implement the independent immutable storage service, signing/capture pipeline
or complete trusted writer deployment. A JSON file controlled by an untrusted
worker is not an acceptable evidence store, even if its signature is valid:
retention, freshness and revocation policy must also be enforced.

Do not enable autonomous merge authorization until the actual deployment and
its isolation tests have been independently verified.
