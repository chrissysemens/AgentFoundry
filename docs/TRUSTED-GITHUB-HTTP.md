# Trusted GitHub HTTP transport

`createTrustedGitHubGet(token)` provides a narrowly scoped authenticated
read-only GitHub REST transport for the evidence-backed writer. It accepts only
repository issue-comment reads and commit-pinned contents reads, rejects
redirects, uses a 10-second request deadline, and limits JSON response size
to 1 MiB. Errors never include the token or response body.

Provision the GitHub token **inside the trusted process** from a protected
secret source. Do not expose it to IPC clients, logs or the issue worker.
Use a GitHub credential with minimal read-only permissions and restrict
outbound network access to the expected GitHub API host.

This is one dependency of the writer, **not the standalone executable**.
It does not provide immutable signed approval attestations, a retained merge
decision store, secure cross-UID socket transport or deployment isolation.
The GitHub API response alone is never sufficient to authorize a merge.

No autonomous merge permissions may be enabled on the basis of this change.
