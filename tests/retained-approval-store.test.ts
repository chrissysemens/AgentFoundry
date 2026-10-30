import { describe, expect, it } from "vitest";
import { createRetainedApprovalAttestationStore } from "../src/retained-approval-store.ts";

describe("retained approval evidence adapter", () => {
  it("reads an independently retained object at a deterministic key", async () => {
    const keys: string[] = [];
    const store = createRetainedApprovalAttestationStore({
      async readRetainedObject(key) {
        keys.push(key);
        return '{"key_id":"primary"}';
      },
    });
    await expect(store.get("owner/repo", 456)).resolves.toEqual({
      key_id: "primary",
    });
    expect(keys).toEqual(["sip-approvals/v1/owner/repo/456.json"]);
  });

  it("returns missing evidence without fabricating approval", async () => {
    const store = createRetainedApprovalAttestationStore({
      async readRetainedObject() {
        return undefined;
      },
    });
    await expect(store.get("owner/repo", 456)).resolves.toBeUndefined();
  });

  it("rejects malformed records and unsafe identifiers", async () => {
    const store = createRetainedApprovalAttestationStore({
      async readRetainedObject() {
        return "{";
      },
    });
    await expect(store.get("owner/repo", 456)).rejects.toThrow(
      "Malformed retained approval JSON",
    );
    await expect(store.get("../repo", 456)).rejects.toThrow(
      "Invalid attestation repository",
    );
    await expect(store.get("owner/repo", 0)).rejects.toThrow(
      "Invalid attestation comment ID",
    );
  });

  it("rejects oversized evidence objects", async () => {
    const store = createRetainedApprovalAttestationStore({
      async readRetainedObject() {
        return "x".repeat(16385);
      },
    });
    await expect(store.get("owner/repo", 456)).rejects.toThrow(
      "Invalid retained approval object",
    );
  });
});
