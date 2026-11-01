# Cross-UID writer socket boundary probe

The existing trusted writer binds a Unix socket in a writer-owned private
directory and restricts the socket to mode 0600. An untrusted UID should not
be able to connect. This script verifies that property against a **live**
socket, rather than a mocked handler.

On a disposable Linux host with Node 24, start the trusted writer using its
real protected UID, and keep the listener running. Then, as root, run:

```sh
node scripts/verify-cross-uid-socket-denial.mjs /private/writer/socket/merge.sock WORKER_UID WORKER_GID
node scripts/verify-sqlite-uid-isolation.mjs /private/writer/db/events.sqlite WORKER_UID WORKER_GID
```

Repeat for the resolver UID/GID. The socket probe passes only if the
untrusted identity gets EACCES or EPERM; ENOENT, connection refusal,
timeouts and successful connections fail. The filesystem harness separately
checks database and directory mutation attempts.

**This is a negative boundary test, not a positive authenticated IPC test.**
The current private socket is intentionally inaccessible across UIDs. Do
not relax the socket or directory permissions to enable connectivity.
A positive test requires a separately designed, narrowly scoped
authenticated broker or equivalent OS-controlled access path, independently
reviewed for credential leakage and journal access.

Record deployment image, git SHA, UID/GID, mount layout, permissions,
command outputs and post-test journal integrity. Do not run against
production. No autonomous merging is authorized by passing these probes.
