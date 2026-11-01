# Fixed-operation trusted relay gate

`createFixedOperationTrustedRelay(brokerCredential, sendFixedWriterRequest)`
validates a strictly shaped `{credential,operation:"authorize-merge"}`
message and calls the trusted callback with **zero caller-supplied arguments**.
It uses constant-time comparison for valid 64-hex credentials, rejects
additional fields, and permits only one in-flight writer call per handler.
The writer must independently validate signed approval and merge evidence.

## Deployment security requirements

**This module is not a process or transport.** It is intended to run
inside a separately isolated trusted relay process, NOT inside the
worker-facing broker. The relay must receive a separately provisioned
broker-to-relay credential and a supervisor-provisioned writer transport.
The writer credential and writer socket descriptor must NEVER be
exposed to the worker-facing broker.

The relay must not have filesystem access to SQLite, its parent,
WAL/SHM files or writable backup/restore paths. It must not run under
the writer UID merely to gain access to the private socket. Any
supervisor descriptor passing must be scoped to the relay identity,
not to the broker identity. The writer still performs all authorization
decisions independently.

This PR provides only the strict relay request gate and unit tests.
A real relay socket listener, credential provisioning, privileged
supervisor setup, preconnected authenticated writer transport and
cross-UID end-to-end negative tests remain outstanding.

Do not enable autonomous merges based on this module alone.
