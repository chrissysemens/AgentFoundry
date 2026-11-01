# Three-UID Linux isolation deployment gate

This gate composes the existing **destructive** SQLite isolation negative
tests with the real worker-facing broker socket connection test. It is
not a broker-to-writer integration test.

## Run only on disposable Linux

Use Node 24+ from the repository root, as root, with a **disposable**
writer-owned SQLite journal already initialized with its `events` table.
The database file and its parent must be owned by the dedicated writer UID
and private (no group/other permissions). Use separate non-root writer,
broker, worker and outsider UIDs. The broker and worker share a dedicated
socket GID; the outsider must not belong to that group.

```sh
node scripts/verify-three-uid-isolation.mjs \
  /absolute/disposable/writer/journal.db \
  WRITER_UID BROKER_UID BROKER_GID WORKER_UID SHARED_GID OUTSIDER_UID OUTSIDER_GID
```

`BROKER_GID` must equal `SHARED_GID`. The script refuses mismatched
identities and unsafe database ownership before running child tests.

The gate must pass all three subprocesses:

1. Broker UID cannot insert a forged `MERGE_AUTHORIZED` event, write
   the database or mutate SQLite sidecars and parent directory.
2. Worker UID is denied the same attacks.
3. Worker UID can connect to the broker's group-scoped socket while
   an outsider UID/GID is denied by the OS.

Any subprocess failure, timeout or inconclusive denial fails the gate.
This probe does not create or modify the disposable writer database,
but its attack attempts are destructive if isolation is misconfigured.
**Never point it at a production journal.**

## Not yet security complete

The worker socket's callback is inert; there is no broker-to-writer
transport. A PASS does not prove authenticated OS peer identity,
credential confidentiality, signed human approval replay, or isolation
from supplementary group memberships, capabilities, ACLs and mount
namespace access. Test these separately in the actual deployment.

The writer's private socket and credential must remain inaccessible to
the broker and worker. No autonomous merging until the full bridge is
implemented and independently verified.
