# Disposable Linux cross-UID fixture (experimental)

Run only on a disposable Linux host or VM with Node 24, as root. This fixture creates its own temporary SQLite journal under a private directory owned by a dedicated non-root writer UID. It invokes the existing negative-test harness as two different untrusted UIDs and deletes the fixture afterward.

```sh
sudo node scripts/run-disposable-uid-isolation.mjs WRITER_UID WRITER_GID WORKER_UID WORKER_GID RESOLVER_UID RESOLVER_GID
```

Use real, distinct non-root UIDs and their actual GIDs. The command requires root to switch identities. **Never use production paths or credentials.**

This is a first integration fixture, not a deployable trusted writer service. It does not establish that an attacker cannot manipulate alternate mounts, open descriptors, supplementary groups, capabilities, symlinks, backup/restore paths or external attestation files. It does not exercise authenticated cross-UID IPC, trusted evidence capture, restart, or concurrency. The existing harness checks that filesystem and SQL operations fail; further work must verify denial reasons and inspect database integrity before claiming strong isolation evidence.

For a release gate, run negative tests against the actual deployed identities, volumes and mount namespaces; retain command output, UID/GID mapping, ownership, mount configuration and exact commit. Independently inspect the journal. Do not enable autonomous merging.
