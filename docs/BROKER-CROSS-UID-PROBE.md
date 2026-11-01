# Cross-UID worker-to-broker socket deployment probe

Run on a **disposable Linux host or container**, as root, using Node 24+
and three already-provisioned distinct non-root UIDs:

```sh
node scripts/verify-broker-cross-uid.mjs BROKER_UID SHARED_GID WORKER_UID OUTSIDER_UID OUTSIDER_GID
```

The broker and worker intentionally share the dedicated socket GID;
the outsider must have a different GID and must **not** be a member of
the shared group. Run with no unexpected supplementary group memberships.
The script creates a temporary broker-owned 0710 directory, launches
the actual TypeScript broker socket under the broker UID/GID, connects
from the worker UID/GID using a fixed authenticated operation, and
requires the outsider connection to fail with EACCES or EPERM. It kills
the temporary broker and deletes its temporary directory on exit.

This is a **positive worker-to-broker connectivity test plus a negative
OS-permission test**. It does not exercise a broker-to-writer connection,
Linux SO_PEERCRED, database isolation, writer credentials, signed human
approval evidence, or GitHub merge authorization. The broker callback
is a deliberately inert stub. Do not interpret PASS as authorization to
enable autonomous merging.

Before production, independently test SQLite directory, WAL/SHM and
rename attacks under both broker and worker UIDs, plus credential
provisioning and rotation, unauthorized supplementary group membership,
socket restart/races, and a reviewed broker-to-writer transport.
