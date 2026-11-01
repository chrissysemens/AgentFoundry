# Group-scoped worker-to-broker Unix socket

This is the **worker-facing** half of a future cross-UID broker.
It is not the writer transport and must not be connected to a privileged
writer callback until that boundary has been independently reviewed.

## Provisioning

Create three distinct non-root identities: writer, broker, worker.
Create a dedicated broker/worker shared group; neither identity may be a
member of the writer's group. The broker process must run with its primary
GID equal to the shared group. Provision a broker-owned directory with
that GID and mode **0710**. The worker must have the shared group as
primary or supplementary GID to traverse the directory and connect to
the broker socket, which is created as **0660**.

The directory must not contain database files, credentials or any other
broker-private assets. The worker's shared group can traverse it but not
list or create entries. A separate broker-private directory must hold
worker credential provisioning; never put credentials in the public socket
directory. The broker must not be in the writer's private group.

The listener enforces a 4 KiB request bound, 64 KiB response bound,
5-second socket timeout and 32-connection cap. It checks its own UID/GID,
directory ownership and mode, and resulting socket ownership and mode.
Use `createWorkerBrokerHandler` for the fixed-operation credential gate.

## Security limitations

Shared-group socket permissions restrict which local processes may
connect; they do **not** authenticate a specific worker UID. Every member
of the group can connect, so the group must be dedicated and tightly
managed. The independent worker credential adds application-layer
authentication but is still a bearer secret. A stolen credential plus
group membership can impersonate the worker.

This listener does not implement OS peer credentials, broker-to-writer
access, rate limiting across reconnects, secure credential provisioning,
or process sandboxing. The writer's private socket stays 0600 in a
writer-only 0700 directory. Do not loosen that boundary.

## Deployment acceptance tests still required

Run a disposable Linux three-UID integration test proving authorized
worker connectivity and unauthorized group denial; verify the worker
cannot list/write the broker socket directory, access the broker
credential directory, connect to the writer socket or modify SQLite,
WAL/SHM files, or their parent directory. Repeat filesystem attacks
under the broker UID. Test restarts, socket replacement, timeouts,
credential rotation and authorization evidence replay. A real
broker-to-writer transport must be designed without granting the broker
the writer UID or direct database access.

No autonomous merging is authorized by this change.
