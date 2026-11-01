# Separated merge writer / bridge deployment contract (experimental)

The current bridge and writer are **not** proven isolated. The same-UID topology documented in `CROSS-UID-MERGE-BRIDGE.md` permits a compromised bridge to mutate the writer-owned journal. Do not enable autonomous merging.

## Proposed identity topology

- Writer UID owns the SQLite database and its `0700` parent; database `0600`.
- A **different** bridge UID receives only traversal of the writer IPC directory (writer UID, bridge GID, `0710`) and connection access to its socket (writer UID, bridge GID, `0660`).
- Bridge UID owns a private `0600` credential, separate from the worker; worker cannot read it.
- Bridge UID owns the worker-facing directory (bridge UID, worker GID, `0710`) and socket (bridge UID, worker GID, `0660`).
- Worker UID is distinct from writer and bridge UIDs. All identities are non-root. Group memberships and ancestor directory traversal must be independently verified; the group IDs must not grant journal access.

`node scripts/check-separated-merge-identities.mjs DB WRITER_SOCKET BRIDGE_SOCKET BRIDGE_SECRET WRITER_UID BRIDGE_UID WORKER_UID BRIDGE_GID WORKER_GID` checks the **existing** filesystem layout and fails closed on ownership, mode, file-type or identity mismatch. It is read-only. It does not start services, authenticate a peer, verify actual UID group membership, or validate ancestor directories.

## Required before use

The existing writer runtime currently requires a private writer socket directory and socket. It must be deliberately adapted and tested to support the narrowly group-accessible IPC topology **without relaxing the journal directory**. Do not merely chmod the existing private writer socket in production.

A root-run disposable Linux integration test must then launch real writer and bridge processes under separate UIDs, demonstrate authorized bridge IPC, denied worker/bridge direct journal writes and outsider socket access, verify credentials are inaccessible to workers, and test symlink/replacement/restart races. Independent human evidence and merge authorization remain mandatory.

**This PR adds a contract and a negative preflight, not the missing production transport or runtime isolation proof.**
