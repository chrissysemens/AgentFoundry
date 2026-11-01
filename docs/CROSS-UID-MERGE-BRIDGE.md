# Cross-UID trusted merge bridge (experimental)

`src/cross-uid-merge-bridge.ts` is a narrow transport adapter. It must run as a dedicated **trusted non-root** identity, not a worker. It accepts only `{"operation":"authorize-merge"}` and forwards the fixed operation through the existing authenticated writer client. No worker-provided credential, ticket, actor, revision, review or decision is forwarded.

## Required identity and permissions

- Writer: private database directory `0700`, private writer socket directory `0700`, socket `0600`. The bridge identity must have OS access to the private writer socket. A separate bridge UID cannot access that socket under the current permissions; a same-UID bridge process is the initial supported topology.
- Bridge: run under the trusted writer UID but as a separate process with tightly scoped privileges. Provision its credential independently and do not expose it to worker processes.
- Public bridge directory: writer UID, designated worker group GID, mode `0710`. Workers can traverse, but cannot list, replace, or create directory entries.
- Public socket: writer UID, designated worker group GID, mode `0660`. The bridge process must be a member of the worker group to assign this GID.
- Worker: distinct UID, member of designated worker group, without access to the writer's private directory, socket or credential.

The bridge's group permission is an **access-control boundary**, not strong cryptographic per-peer identity. Every member of the designated group can request a fresh authorization evaluation. The writer must continue to independently verify human evidence and enforce idempotency. The bridge cannot be used as a generic RPC proxy.

## Missing release gates

This PR is a transport component, **not** a deployed service or production security claim. Before enabling it, add a root-enabled disposable Linux fixture that starts the actual writer and bridge under their configured identities, tests authorized and unauthorized group members, verifies direct journal writes fail, checks credential confidentiality, exercises restart and replacement races, and confirms independent human-evidence verification. Security review must also consider same-UID bridge compromise: a compromised bridge can access writer-owned resources, so process separation alone does not protect against a compromised bridge.

Do not expose this socket publicly, add permissive directory write bits, or enable autonomous merging.
