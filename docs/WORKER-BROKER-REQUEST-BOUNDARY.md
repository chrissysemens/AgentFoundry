# Worker-to-broker request boundary

The worker-facing broker gate accepts exactly two fields: a 64-character
lowercase hexadecimal credential and the literal operation
`authorize-merge`. It forwards **no worker-selected merge fields**.
A trusted callback receives no arguments. A rejected request cannot call
the callback; forwarding failures propagate without granting authorization.

The worker credential is **not** the writer credential. It must be
independently generated, provisioned and rotated. The gate uses a
constant-time comparison for well-formed credentials.

## Not a deployable cross-UID broker

This module intentionally does not open a socket, discover the caller's
Linux UID, provision credentials, or connect to the writer. Bearer
authentication is not OS peer authentication. Do not expose it on a
shared or public socket without separately enforcing the worker UID
boundary, request throttling, lifecycle controls and credential secrecy.

The trusted writer's private socket remains mode 0600 inside a 0700
writer-owned directory. A separate broker UID cannot connect today.
Do not fix that by granting the broker writer UID, database access or
unrestricted access to the writer credential.

## Remaining implementation and acceptance gates

1. Design an OS-mediated, narrowly scoped broker-to-writer transport
   that does not give the broker SQLite write or replacement capability.
2. Bind the worker-facing listener to the approved Linux peer identity
   using an independently reviewed mechanism; add resource limits.
3. Prove positive and negative connections with three real UIDs in a
   disposable Linux environment, including unauthorized peers and
   credential theft attempts.
4. Run database directory/WAL/SHM/rename negative tests as both worker
   and broker identities.
5. Prove exact-revision signed human evidence is still required inside
   the writer; test crash/restart and replay behavior.

No production-ready cross-UID broker or autonomous merge capability is
claimed by this change.
