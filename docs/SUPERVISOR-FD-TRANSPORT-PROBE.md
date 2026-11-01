# Supervisor-passed connected Unix socket: cross-UID experiment

This experiment tests a narrow Linux capability: a privileged supervisor
connects to a writer-owned private Unix socket and passes **only that
connected socket descriptor** to a separately identified broker child
through inherited file descriptor 3.

The writer socket remains in a 0700 writer-owned directory, with mode 0600. The broker's direct connection attempt must fail with EACCES or
EPERM. The broker then exchanges a fixed **inert ping** over the
supervisor-provisioned connected descriptor.

Run **only on a disposable Linux host**, as root, using Node 24+:

```sh
node scripts/verify-supervisor-fd-transport.mjs \
  WRITER_UID WRITER_GID BROKER_UID BROKER_GID
```

The script creates and removes its own temporary socket directory and
uses separate non-root UIDs. It does not access an Agent Foundry journal.

## What a passing test would establish

A supervisor can arrange one cross-UID connected socket without making
the writer's private socket pathname accessible to the broker.

## What it absolutely does not establish

This is **not** a production broker-to-writer implementation. The
writer is an inert ping server, not the authenticated merge service.
A connected descriptor grants the broker the ability to send arbitrary
bytes on that connection. The broker therefore MUST NOT be given a
connection that accepts an unrestricted privileged writer credential or
unvalidated merge operations. The experiment does not test database
access, privilege dropping, Linux capabilities, supplementary groups,
SO_PEERCRED, descriptor replay, restarts, or real approval evidence.

A production design needs a trusted fixed-operation relay that holds
the writer credential outside the broker, independently validates the
request and authenticates the relay's origin. That relay must be
isolated from SQLite, or its ability to forge events remains a critical
risk. The exact supervisor/relay architecture and OS sandboxing require
review and disposable deployment tests before integration.

No autonomous merging is enabled or authorized by this experiment.
