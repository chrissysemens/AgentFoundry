import { timingSafeEqual } from "node:crypto";

/**
 * Trusted relay request gate. Run ONLY in a separately isolated relay
 * process, never inside the worker-facing broker.
 *
 * The writer transport callback is provisioned by the trusted supervisor.
 * It must send a fixed authorize-merge request and must never expose its
 * writer credential or raw connected writer socket to the broker.
 */
export function createFixedOperationTrustedRelay(
  brokerCredential: string,
  sendFixedWriterRequest: () => Promise<unknown>,
): (request: unknown) => Promise<unknown> {
  if (
    !/^[a-f0-9]{64}$/.test(brokerCredential) ||
    typeof sendFixedWriterRequest !== "function"
  ) {
    throw new Error("Invalid trusted relay configuration");
  }
  const expected = Buffer.from(brokerCredential, "hex");
  let busy = false;

  return async (request: unknown): Promise<unknown> => {
    if (
      request === null ||
      typeof request !== "object" ||
      Array.isArray(request)
    ) {
      throw new Error("Invalid relay request");
    }
    const record = request as Record<string, unknown>;
    if (
      Object.keys(record).length !== 2 ||
      !Object.hasOwn(record, "credential") ||
      !Object.hasOwn(record, "operation") ||
      record.operation !== "authorize-merge" ||
      typeof record.credential !== "string" ||
      !/^[a-f0-9]{64}$/.test(record.credential)
    ) {
      throw new Error("Invalid relay request");
    }
    if (!timingSafeEqual(expected, Buffer.from(record.credential, "hex"))) {
      throw new Error("Relay authentication failed");
    }
    if (busy) throw new Error("Relay authorization already in progress");
    busy = true;
    try {
      return await sendFixedWriterRequest();
    } finally {
      busy = false;
    }
  };
}
