import { isAbsolute, resolve } from "node:path";

export interface TrustedWriterBootstrapConfig {
  databasePath: string;
  socketPath: string;
  credentialPath: string;
  repository: string;
  ticket: string;
  issueNumber: number;
  commentId: number;
  allowedHumanIds: readonly number[];
}

/**
 * Parse an operator-provisioned bootstrap configuration, not an IPC request.
 * Reject unknown fields so a typo cannot silently change authorization scope.
 */
export function parseTrustedWriterBootstrapConfig(
  input: unknown,
): TrustedWriterBootstrapConfig {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Trusted writer configuration must be an object");
  }
  const data = input as Record<string, unknown>;
  const fields = [
    "databasePath",
    "socketPath",
    "credentialPath",
    "repository",
    "ticket",
    "issueNumber",
    "commentId",
    "allowedHumanIds",
  ];
  if (
    Object.keys(data).length !== fields.length ||
    !fields.every((field) => Object.hasOwn(data, field))
  ) {
    throw new Error("Unknown or missing trusted writer configuration fields");
  }
  for (const field of ["databasePath", "socketPath", "credentialPath"]) {
    const value = data[field];
    if (typeof value !== "string" || !isAbsolute(value)) {
      throw new Error(`Absolute ${field} required`);
    }
  }
  const paths = ["databasePath", "socketPath", "credentialPath"].map((field) =>
    resolve(data[field] as string),
  );
  if (new Set(paths).size !== paths.length) {
    throw new Error("Trusted writer paths must be distinct");
  }
  if (
    typeof data.repository !== "string" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(data.repository) ||
    typeof data.ticket !== "string" ||
    !data.ticket.trim()
  ) {
    throw new Error("Valid repository and ticket required");
  }
  for (const field of ["issueNumber", "commentId"]) {
    const value = data[field];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`Positive safe integer ${field} required`);
    }
  }
  if (
    !Array.isArray(data.allowedHumanIds) ||
    data.allowedHumanIds.length === 0 ||
    !data.allowedHumanIds.every(
      (id: unknown) => typeof id === "number" && Number.isSafeInteger(id) && id > 0,
    ) ||
    new Set(data.allowedHumanIds).size !== data.allowedHumanIds.length
  ) {
    throw new Error("Unique trusted human IDs required");
  }
  return {
    databasePath: paths[0]!,
    socketPath: paths[1]!,
    credentialPath: paths[2]!,
    repository: data.repository,
    ticket: data.ticket,
    issueNumber: data.issueNumber as number,
    commentId: data.commentId as number,
    allowedHumanIds: Object.freeze([...(data.allowedHumanIds as number[])]),
  };
}
