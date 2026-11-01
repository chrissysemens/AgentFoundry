# Durable SIP attestation file store

`FileSipAttestationStore` provides a concrete create-once storage adapter for
the trusted capture sink and signed verification reader. It uses a deterministic
SHA-256-derived filename, `O_CREAT | O_EXCL | O_NOFOLLOW`, file and directory
`fsync`, and a bounded no-follow read. A second writer cannot overwrite an
existing record through the adapter; records survive process restarts.

**This is not a complete immutable storage security boundary.** A process
with filesystem write permissions can still delete, rename, truncate or
replace these files. Deploy the directory under a separate trusted UID,
prevent untrusted directory access, and test those restrictions from a
different UID. Signed verification must remain mandatory on every read.

A crash between exclusive file creation and successful `fsync` can leave
a partial record. Reads fail closed; operators must investigate and recover
such records rather than silently replace them. A real deployment also needs
ownership and mode preflight, retention policy, backups and crash-injection
testing. This PR does not complete the standalone trusted writer or resolve
the SQLite direct-SQL bypass. Autonomous merging remains disabled.
