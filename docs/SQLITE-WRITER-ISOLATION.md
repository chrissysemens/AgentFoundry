# SQLite writer isolation — deployment contract (draft)

## Security invariant

Only the independently authenticated trusted authorization service may open the authoritative SQLite journal for writing. The untrusted issue worker, Oracle reviewer, GitHub resolver, and any web-facing request process MUST NOT share the service's operating-system identity, writable database directory, SQLite file descriptor, or privileged journal constructor.

This is an **infrastructure-enforced boundary**, not a TypeScript access modifier. An untrusted process with write access to the database file or its containing directory can bypass `SQLiteJournal` and forge `MERGE_AUTHORIZED` records, as PR #9 demonstrated.

## Deployment requirements

1. Run the trusted authorization service under a dedicated non-login OS identity, separate from issue workers and the GitHub resolver. Use a dedicated volume containing the SQLite database and any SQLite journal/SHM files. The service alone must have filesystem write access to the database **and its parent directory**. Deny other identities write access to the volume and prevent writable bind mounts of it into untrusted containers.
2. Expose a narrow authenticated request interface, never a generic SQL endpoint or arbitrary event append. Do not expose `appendIfLastEventMatches` or `allowPrivilegedMergeWrites` to untrusted callers. Authenticate service clients independently and authorize each operation.
3. Before authorization, resolve independently authenticated human merge evidence, verify trusted signing key and revocation status, bind repository/ticket/commit/Oracle verdict, and replay verified journal state. Fail closed on any unavailable or mismatched evidence.
4. Keep final event-ID comparison and append in one SQLite `BEGIN IMMEDIATE` transaction. A single-process busy flag is insufficient for cross-process consistency.
5. Never give the GitHub merge resolver permission to write the journal. The resolver must independently verify a trusted, fresh, exact-commit authorization before calling GitHub's merge API.
6. Protect backups, restore paths, migrations, diagnostic shells, sidecars and CI runners with the same write-isolation policy. Read-only filesystem access is not proof of evidence authenticity; independently validate retained evidence.
7. Use operator-managed keys and immutable external evidence retention. A successful SQLite transaction alone is not merge authorization.

## Mandatory pre-production negative tests

Run against the actual deployment identities and mounted volumes, not only in-process mocks.

- From an untrusted worker identity, attempt to open the SQLite database in read-write mode and INSERT a forged `MERGE_AUTHORIZED` event; require an OS/database permission failure and no event change.
- From that identity, attempt to create, replace, rename, or delete the database file, and create/write SQLite WAL/SHM files in its parent directory; require failure.
- From the GitHub resolver identity, repeat the direct SQL write attempt; require failure.
- Confirm the trusted service can write only after independent decision verification; reject missing, invalid, revoked, expired, wrong-repository, wrong-commit and stale approvals.
- Start two trusted service processes racing to authorize the same ticket; require at most one valid authorization and no stale acceptance.
- Restart the trusted service, replay the journal, restore from backup in a staging environment and repeat all negative tests.
- Verify denial of access remains effective when the service is compromised at the untrusted-worker privilege level; test actual container mount and identity boundaries.

## Release gate

This document does not implement the service or enforce filesystem permissions. Do not mark SQLite writer isolation complete until deployment configuration, negative test output, independent review and exact-commit CI evidence are attached to a subsequent PR. Do not enable autonomous production merging on the strength of this document.
