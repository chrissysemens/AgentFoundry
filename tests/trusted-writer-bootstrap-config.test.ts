import { describe, expect, it } from "vitest";
import { parseTrustedWriterBootstrapConfig } from "../src/trusted-writer-bootstrap-config.ts";

const valid = {
  databasePath: "/var/lib/foundry/events.sqlite",
  socketPath: "/run/foundry/writer.sock",
  credentialPath: "/run/secrets/foundry-ipc",
  repository: "example/project",
  ticket: "FOUND-123",
  issueNumber: 123,
  commentId: 456,
  allowedHumanIds: [101, 102],
};

describe("trusted writer bootstrap configuration", () => {
  it("accepts explicit scoped configuration", () => {
    expect(parseTrustedWriterBootstrapConfig(valid)).toEqual(valid);
  });

  it("rejects unknown fields and missing values", () => {
    expect(() =>
      parseTrustedWriterBootstrapConfig({ ...valid, debug: true }),
    ).toThrow("Unknown or missing");
    expect(() =>
      parseTrustedWriterBootstrapConfig({ ...valid, ticket: "" }),
    ).toThrow("repository and ticket");
  });

  it("rejects paths that could alias protected files", () => {
    expect(() =>
      parseTrustedWriterBootstrapConfig({
        ...valid,
        credentialPath: "/var/lib/foundry/../foundry/events.sqlite",
      }),
    ).toThrow("must be distinct");
    expect(() =>
      parseTrustedWriterBootstrapConfig({ ...valid, socketPath: "writer.sock" }),
    ).toThrow("Absolute");
  });

  it("rejects invalid repository and ambiguous human allowlists", () => {
    expect(() =>
      parseTrustedWriterBootstrapConfig({ ...valid, repository: "project" }),
    ).toThrow("repository and ticket");
    expect(() =>
      parseTrustedWriterBootstrapConfig({ ...valid, allowedHumanIds: [101, 101] }),
    ).toThrow("Unique trusted human IDs");
    expect(() =>
      parseTrustedWriterBootstrapConfig({ ...valid, commentId: 0 }),
    ).toThrow("Positive safe integer");
  });
});
