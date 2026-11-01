import { isAbsolute, resolve } from "node:path";

export interface IpcBrokerBoundary {
  readonly writerUid: number;
  readonly brokerUid: number;
  readonly workerUid: number;
  readonly writerDatabaseDirectory: string;
  readonly writerSocketDirectory: string;
  readonly brokerPublicSocketDirectory: string;
  readonly brokerCredentialDirectory: string;
}

/**
 * Validate a proposed broker deployment before provisioning any sockets.
 * This checks configuration only; actual UID, ACL, mount and capability
 * isolation must be established and tested on the deployment host.
 */
export function validateIpcBrokerBoundary(
  boundary: IpcBrokerBoundary,
): IpcBrokerBoundary {
  const identities = [
    boundary.writerUid,
    boundary.brokerUid,
    boundary.workerUid,
  ];
  if (
    identities.some((uid) => !Number.isSafeInteger(uid) || uid <= 0) ||
    new Set(identities).size !== identities.length
  ) {
    throw new Error("Writer, broker and worker require distinct non-root UIDs");
  }
  const paths = [
    boundary.writerDatabaseDirectory,
    boundary.writerSocketDirectory,
    boundary.brokerPublicSocketDirectory,
    boundary.brokerCredentialDirectory,
  ];
  if (paths.some((path) => !isAbsolute(path))) {
    throw new Error("Absolute broker boundary paths required");
  }
  const resolved = paths.map((path) => resolve(path));
  if (new Set(resolved).size !== resolved.length) {
    throw new Error("Broker boundary directories must be distinct");
  }
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      if (
        resolved[i]!.startsWith(resolved[j]! + "/") ||
        resolved[j]!.startsWith(resolved[i]! + "/")
      ) {
        throw new Error("Broker boundary directories must not be nested");
      }
    }
  }
  return Object.freeze({
    writerUid: boundary.writerUid,
    brokerUid: boundary.brokerUid,
    workerUid: boundary.workerUid,
    writerDatabaseDirectory: resolved[0]!,
    writerSocketDirectory: resolved[1]!,
    brokerPublicSocketDirectory: resolved[2]!,
    brokerCredentialDirectory: resolved[3]!,
  });
}
