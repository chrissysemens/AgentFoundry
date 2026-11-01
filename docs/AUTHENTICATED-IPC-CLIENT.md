# Authenticated writer IPC: integration status

The trusted writer already authenticates a narrow `authorize-merge` envelope with a writer-provisioned credential. `src/trusted-writer-ipc-client.ts` now provides a bounded client with timeout, response-size limit, and a fixed operation. The client does **not** accept a ticket, actor, revision, review or authorization decision.

## Not yet a cross-UID deployment

The writer's current filesystem assertions require a writer-owned socket directory with mode `0700`, and the socket listener uses mode `0600`. Consequently a different worker UID **cannot connect** in the current deployment. Do not weaken these permissions just to make the client connect.

A deployment-ready transport must explicitly design and test an authenticated, OS-controlled access path for distinct UIDs (for example a separately reviewed proxy with constrained identity and no journal access), while preserving the writer-only database directory and independently provisioned credentials. It must also verify that workers cannot read the credential file or obtain the credential through their environment.

Before production use, perform root-enabled disposable Linux tests for successful authorized transport, denied unauthenticated requests, worker/resolver SQLite mutation attempts, service restarts, socket replacement races, and independent human evidence verification. Obtain security review. No autonomous merge is enabled by this client.
