import { describe, expect, it } from "vitest";
import { createRetainedMergeDecisionStore } from "../src/retained-merge-decision-store.ts";

describe("retained merge decision reader", () => {
  it("reads a deterministic key from an independent backend", async () => {
    const keys: string[] = [];
    const store = createRetainedMergeDecisionStore({
      async readRetainedObject(key) {
        keys.push(key);
        return '{"key_id":"operator-1"}';
      },
    });
    await expect(store.get("owner/repo", 456)).resolves.toEqual({
      key_id: "operator-1",
    });
    expect(keys).toEqual(["merge-decisions/v1/owner/repo/456.json"]);
  });

  it("fails closed on missing, malformed, and oversized records", async () => {
    const missing = createRetainedMergeDecisionStore({
      async readRetainedObject() {
        return undefined;
      },
    });
    await expect(missing.get("owner/repo", 456)).resolves.toBeUndefined();
    const malformed = createRetainedMergeDecisionStore({
      async readRetainedObject() {
        return "{";
      },
    });
    await expect(malformed.get("owner/repo", 456)).rejects.toThrow(
      "Malformed retained merge decision JSON",
    );
    const oversized = createRetainedMergeDecisionStore({
      async readRetainedObject() {
        return "x".repeat(16385);
      },
    });
    await expect(oversized.get("owner/repo", 456)).rejects.toThrow(
      "Invalid retained merge decision object",
    );
  });

  it("rejects unsafe repository and comment identifiers before fetching", async () => {
    const store = createRetainedMergeDecisionStore({
      async readRetainedObject() {
        throw new Error("Must not fetch");
      },
    });
    await expect(store.get("../repo", 456)).rejects.toThrow(
      "Invalid merge decision repository",
    );
    await expect(store.get("owner/repo", 0)).rejects.toThrow(
      "Invalid merge decision comment ID",
    );
  });
  it("propagates backend failures instead of treating them as missing evidence", async () => {
    const store = createRetainedMergeDecisionStore({
      async readRetainedObject() {
        throw new Error("Retention backend unavailable");
      },
    });
    await expect(store.get("owner/repo", 456)).rejects.toThrow(
      "Retention backend unavailable",
    );
  });
});
