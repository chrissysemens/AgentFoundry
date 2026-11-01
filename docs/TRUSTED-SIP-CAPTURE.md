# Trusted SIP approval capture contract

`captureSignedSipApproval` obtains the original approval comment through a
trusted authenticated GitHub reader, validates its author, timestamps,
repository, issue and exact SIP identity, then signs a domain-separated
Ed25519 attestation and calls `putIfAbsent` on a retention sink.

The sink MUST be independently controlled, durable and append-only. Its
`putIfAbsent` operation MUST be atomic across concurrent processes and
MUST refuse replacement or deletion of an existing repository/comment key.
The signing private key MUST remain inaccessible to issue workers, PR agents
and IPC callers. The trusted capture service MUST independently establish
that the requested SIP identity matches the reviewed commit, and enforce
appropriate freshness and capture authorization.

**Not implemented here:** a concrete durable immutable sink, trusted
capture-service deployment, key provisioning and rotation operations, or
automatic wiring into the writer. This contract alone does not establish
immutability or prevent a compromised signing service from fabricating
evidence. Direct-SQL bypass remains a release blocker. Autonomous merges
remain disabled.
