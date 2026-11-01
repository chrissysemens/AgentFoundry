# Cross-UID SQLite isolation verification

This is a **deployment test**, not a mock. Run only on a disposable Linux
host/volume, never on the production journal. The test script is intentionally
not part of the default unit test suite because it requires root and attempts
destructive filesystem operations.

## Preconditions

- Create a disposable SQLite journal using the real trusted writer identity.
- Ensure its containing directory and database are private to the writer.
- Have two separate untrusted identities: issue worker and GitHub resolver.
- Verify that the writer UID differs from each untrusted UID and that the
  untrusted identities do not have privileged capabilities, shared write
  groups, writable mounts or access to the writer's SQLite file descriptor.
- Run with Node 24 on Linux as root. Pass the **actual** primary GID for each
  identity; UID and GID are not necessarily equal.

## Negative tests

Run once per untrusted identity, replacing placeholders with disposable paths
and numeric IDs:

```sh
sudo node scripts/verify-sqlite-uid-isolation.mjs /private/disposable/events.sqlite WORKER_UID WORKER_GID
sudo node scripts/verify-sqlite-uid-isolation.mjs /private/disposable/events.sqlite RESOLVER_UID RESOLVER_GID
```

Each run must deny: direct forged `MERGE_AUTHORIZED` SQL insertion, opening
the database for writing, database rename and delete, creating a sibling file,
and creating or writing SQLite `-wal` and `-shm` files. Existing WAL/SHM
files are tested for writing if present; attempts on absent files must also
fail. A single unexpected success fails the command. The harness also fails closed\nwhen a probe throws an unexpected error (for example, a malformed SQL statement)\ninstead of an OS or SQLite access-denial error. Such results are reported as\n`INCONCLUSIVE` and must be investigated rather than counted as isolation proof.

**Capture evidence** for the exact image/commit, filesystem ownership and
permissions, UID/GID mapping, container mount configuration, command output
and test results. Independently inspect the journal afterward to ensure no
forged event or filesystem mutation occurred.

## Still required before the release gate

This harness cannot prove isolation of other mounts, supplementary groups,
Linux capabilities, compromised privileged sidecars, backups or restore paths.
It does not establish peer authentication or authorized cross-UID socket
connectivity. Run service-level restart, concurrency and verified-evidence
tests separately, and obtain an independent security review.

**Do not enable autonomous merging merely because these checks pass.**

## Interpretation

A passing negative test demonstrates only that the tested untrusted UID/GID
could not perform the listed mutations in that specific disposable deployment.
It does **not** prove that a cross-UID client can connect to the trusted
writer. The writer currently uses a private socket directory and restrictive
socket permissions; do not loosen them just to make a connectivity test pass.
A separate authenticated and OS-authorized IPC deployment design is needed
before a positive cross-UID request test can be meaningful.
