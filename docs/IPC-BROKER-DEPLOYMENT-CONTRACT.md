# Cross-UID IPC broker: deployment contract and threat model

## Why a direct connection cannot work

The trusted writer's socket lives in a writer-owned 0700 directory and
uses mode 0600. An untrusted worker cannot connect. Making the socket
world-accessible, giving workers the writer UID, or handing the writer's
bearer credential to workers defeats the intended isolation.

## Required three-identity design

Use distinct non-root Linux identities for the writer, broker and worker.
Keep the authoritative SQLite database and writer socket private to the
writer. Expose a **separate** broker-facing socket to the worker, restricted
to the expected worker identity. The broker must never open SQLite or
receive an unrestricted journal file descriptor.

A broker still needs a narrowly scoped, OS-controlled way to reach the
writer's private socket. That access mechanism is **not implemented**.
Options such as an administrator-provisioned connected descriptor or a
separately reviewed privileged supervisor require explicit threat modeling;
do not grant the broker the writer UID or broad database-directory access.

The broker should accept only a fixed `authorize-merge` operation, never
caller-supplied human IDs, SIP revisions, review IDs, evidence or merge
decisions. It must enforce request and response size limits, deadlines,
connection limits, strict response parsing and rate limits. The writer
must independently verify exact-revision human evidence and make the
authorization decision. A worker request is not authorization.

## Credential boundary

The broker must not receive the writer's unrestricted bearer secret through
worker-controlled configuration, environment or IPC. A compromised broker
must not be able to forge a merge decision. Before implementation, decide
whether broker access is mediated by authenticated OS peer identity or a
narrowly scoped one-way transport. The current bearer-secret client is
**not suitable** for distributing credentials to untrusted workers.

## Verification gates

`validateIpcBrokerBoundary` checks only that proposed UIDs are distinct
and paths are absolute, distinct and non-nested. It is not an OS security
check and must not be used as a production readiness gate.

On a disposable Linux deployment, prove: authorized worker-to-broker
connectivity; rejected unauthorized peers; no worker or broker SQLite
write/rename/WAL/SHM access; no worker credential-file access; no access
to writer private socket; safe restarts and socket replacement behavior;
rejected malformed and oversized messages; and no authorization without
independently signed exact-revision human evidence.

No autonomous merging until these checks and independent review pass.
