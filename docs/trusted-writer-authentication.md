# Trusted writer deployment — authentication increment

This change adds a strict shared-secret envelope around the trusted merge
request handler. It is **not** a complete deployment or proof of isolation.

## Authentication contract

The writer constructs `createAuthenticatedMergeHandler(secret, handler)` in
its trusted process. Provision `secret` as 32 bytes from a cryptographically
secure random generator, encoded as 64 lowercase hex characters. Do not commit
it, pass it as a CLI argument, or expose it to issue workers. The client sends
one newline-delimited JSON object:

```json
{
  "credential": "<64 lowercase hex characters>",
  "request": { "operation": "authorize-merge" }
}
```

The wrapper rejects extra top-level fields, malformed credentials, and
mismatches before invoking the trusted evidence resolver. The underlying
handler still rejects caller-selected ticket, actor, and evidence fields.

## Deployment work still required

- Establish a dedicated non-root writer UID and private writable SQLite volume.
- Design a **separate authorized IPC client identity** and socket access policy.
  The existing startup preflight requires the socket directory to be 0700
  writer-owned, so a different UID cannot connect yet. Do not loosen this
  check without an independently reviewed peer-identity design.
- Provision and rotate the IPC secret using a protected secret store. Shared
  secrets are bearer credentials and do not establish OS peer identity.
- Wire the authenticated handler into a dedicated trusted-process entrypoint,
  with independently verified GitHub and signed decision evidence.
- Run cross-UID direct-SQL, WAL/SHM, rename/delete, restart and race tests on
  disposable deployment volumes, including the GitHub resolver identity.
- Confirm independent Oracle ACCEPT and explicit human merge authorization
  on the exact commit before enabling autonomous production merges.

**Release gate:** direct-SQL authorization forgery remains possible wherever
untrusted identities can write the SQLite database or its parent directory.
Do not treat passing unit tests as closing that bypass.
