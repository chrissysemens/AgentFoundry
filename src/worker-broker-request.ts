import { timingSafeEqual } from "node:crypto";

/**
 * Worker-facing broker request boundary. This is NOT a socket listener,
 * a peer-identity check, or a writer transport.
 *
 * The callback must be provisioned by the trusted deployment, never by a
 * worker. The writer independently validates all merge evidence.
 */
export function createWorkerBrokerHandler(
  workerCredential: string,
  forwardFixedRequest: () => Promise<unknown>,
): (input: unknown) => Promise<unknown> {
  if (!/^[a-f0-9]{64}$/.test(workerCredential)) {
    throw new Error("Invalid broker worker credential");
  }
  const expected = Buffer.from(workerCredential, "hex");
  return async (input: unknown): Promise<unknown> => {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Invalid broker request");
    }
    const record = input as Record<string, unknown>;
    if (
      Object.keys(record).length !== 2 ||
      !Object.hasOwn(record, "credential") ||
      !Object.hasOwn(record, "operation") ||
      record.operation !== "authorize-merge" ||
      typeof record.credential !== "string" ||
      !/^[a-f0-9]{64}$/.test(record.credential)
    ) {
      throw new Error("Invalid broker request");
    }
    const supplied = Buffer.from(record.credential, "hex");
    if (!timingSafeEqual(expected, supplied)) {
      throw new Error("Broker authentication failed");
    }
    return forwardFixedRequest();
  };
}
