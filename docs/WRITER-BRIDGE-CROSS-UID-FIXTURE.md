# Disposable writer → bridge cross-UID integration fixture

Run only as root on an isolated disposable Linux test host with Node 24+ and util-linux `setpriv`. Provide seven **pre-provisioned**, distinct, non-root identities and groups:

```sh
node scripts/verify-writer-bridge-cross-uid.mjs \
  WRITER_UID BRIDGE_UID WORKER_UID OUTSIDER_UID \
  BRIDGE_GID WORKER_GID OUTSIDER_GID
```

The fixture creates a temporary journal, protected writer IPC socket, group-scoped bridge socket and a disposable credential. It starts the real trusted-writer transport and bridge under different UIDs, with the bridge in both IPC groups. It checks that the worker can reach the writer **only through** the bridge, that an outsider cannot reach the bridge, and that bridge and worker UIDs cannot directly mutate the SQLite journal. It also sends malformed/worker-supplied authorization fields through the bridge and checks that worker and outsider identities cannot read the bridge credential file. It cleans up processes and files after the run.

**Important limits:** The writer's handler returns a fixed fixture response; it does not validate human approval evidence or perform a real merge. The fixture passes a known test-only credential to the writer subprocess and provisions it to the bridge; it does not prove production secret management. The credential-read checks cover filesystem access only, not leakage through process arguments, /proc, logs, memory or inherited file descriptors. It does not test hostile supplementary groups, ancestor-path attacks, restart/replacement races, or malicious bridge code. It is deliberately **not** run in ordinary unprivileged CI. Do not run against production data. No autonomous merging.
