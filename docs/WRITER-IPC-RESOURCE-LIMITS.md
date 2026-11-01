# Trusted writer IPC resource limits

The private writer socket now caps simultaneous accepted connections at 32,
retains the existing 4 KiB request limit and 5-second idle timeout, and
rejects serialized handler responses larger than 64 KiB. Excess connections
are refused by Node's server connection limit.

These controls reduce accidental and malicious resource consumption but do
not prove resistance to denial of service. The handler may continue working
after a client times out; an attacker able to reach the socket could still
consume CPU or trigger repeated evidence reads. Deployment must enforce
OS-level socket access and independent request throttling.

The cross-UID broker is not implemented by this change. The writer socket
and SQLite directory must remain private, and autonomous merging remains
disabled until cross-UID deployment isolation and authorization are proven.
