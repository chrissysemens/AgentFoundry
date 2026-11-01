# Trusted writer process lifecycle

The `runTrustedWriterProcess(databasePath, socketPath, secretFile, trustedHandler)`
helper starts the protected Unix socket runtime and waits for SIGINT or SIGTERM.
On the first shutdown signal it closes the server and cleans up its owned
socket. Startup failures propagate; there is no demo-approval fallback.

**This is a lifecycle building block, not a deployable executable.** The
caller must construct `trustedHandler` **inside the protected writer
process** using authenticated GitHub evidence, a retained signed decision
store, trusted keys and verified SIP replay. Never accept an arbitrary
handler module path, actor, ticket, decision or SQL command from an untrusted
worker. A separate trusted bootstrap and deployment manifest remain necessary.

The existing filesystem preflight requires a dedicated non-root Linux UID,
private writer-owned SQLite and socket directories, and a private database
file. The socket is mode 0600 within a 0700 directory. Consequently a
different-UID client cannot connect: **do not loosen these permissions just
to make integration work**. Design and independently review authorized
cross-UID communication and peer identity before doing so.

Production readiness also requires:
- Actual writer-only SQLite volume and WAL/SHM permissions, including
  containers, backups and restore paths.
- Independently provisioned and rotated IPC credentials.
- Process-level attack tests from worker and GitHub resolver UIDs.
- Race, restart, recovery and exact-commit evidence verification.
- An independently reviewed release gate before autonomous merging.

See [SQLite isolation](SQLITE-WRITER-ISOLATION.md).
