import { describe, expect, it } from "vitest";
import { validateIpcBrokerBoundary } from "../src/ipc-broker-boundary.ts";

const valid = {
  writerUid: 2001,
  brokerUid: 2002,
  workerUid: 2003,
  writerDatabaseDirectory: "/srv/af/writer-db",
  writerSocketDirectory: "/srv/af/writer-socket",
  brokerPublicSocketDirectory: "/run/af/public",
  brokerCredentialDirectory: "/run/af/broker-secret",
};

describe("IPC broker deployment boundary", () => {
  it("accepts distinct identities and separate absolute directories", () => {
    expect(validateIpcBrokerBoundary(valid)).toEqual(valid);
  });

  it("rejects shared writer, broker or worker identities", () => {
    expect(() =>
      validateIpcBrokerBoundary({ ...valid, brokerUid: 2001 }),
    ).toThrow("distinct non-root UIDs");
    expect(() =>
      validateIpcBrokerBoundary({ ...valid, workerUid: 0 }),
    ).toThrow("distinct non-root UIDs");
  });

  it("rejects nested, duplicate and relative directories", () => {
    expect(() =>
      validateIpcBrokerBoundary({
        ...valid,
        brokerPublicSocketDirectory: "/srv/af/writer-db/public",
      }),
    ).toThrow("must not be nested");
    expect(() =>
      validateIpcBrokerBoundary({
        ...valid,
        brokerCredentialDirectory: valid.writerSocketDirectory,
      }),
    ).toThrow("must be distinct");
    expect(() =>
      validateIpcBrokerBoundary({
        ...valid,
        brokerCredentialDirectory: "relative",
      }),
    ).toThrow("Absolute broker boundary paths");
  });
});
