# Trusted writer deployment hardening — staged gate

This stage adds runtime checks to `runEvidenceBackedTrustedWriter` before
opening privileged SQLite. It requires Linux, matching real/effective non-root
UID/GID, no root supplementary group, private writer-owned database and
database/socket directories, no symlinks at those paths, and a writable
database directory. Existing socket lifecycle preflight remains in force.

These checks are **necessary but insufficient**. They do not establish
separate UID deployment, prevent privileged Linux capabilities, or prove that
untrusted containers cannot mount the writer volume. A compromised process
sharing the writer UID can still forge events through direct SQL.

## Required operator deployment

- Provision a dedicated writer identity and private database volume.
- Ensure untrusted workers and the GitHub resolver use different UIDs, cannot
  assume the writer UID, and have no writable bind mount to the database
  directory, database file, WAL/SHM files, backups or restore destinations.
- Provision trusted GitHub API access, immutable approval attestations,
  independently retained signed merge decisions and revocation policy inside
  the writer. No user-controlled module or unsigned JSON fallback.
- Design a separate authenticated transport for cross-UID clients. Current
  private socket directory and socket mode prevent cross-UID connections;
  **do not simply chmod the socket to make it reachable**.
- Run the disposable cross-UID test harness for each untrusted identity.
  Record exact image/commit, mounts, UIDs/GIDs, permissions and results.
- Independently verify authorized operation, restart/recovery, concurrency
  and absence of forged journal events.

## Release status

There is still no fully provisioned standalone executable or tested deployment
manifest. This PR does **not** close the direct-SQL bypass or authorize
production merging. These are explicit pending acceptance gates.
