import { describe, expect, it, vi } from "vitest";
import { createWorkerBrokerHandler } from "../src/worker-broker-request.ts";

const credential = "a".repeat(64);

describe("worker broker request boundary", () => {
  it("forwards only a credentialed fixed operation", async () => {
    const forward = vi.fn(async () => ({ accepted: true }));
    const handler = createWorkerBrokerHandler(credential, forward);
    await expect(
      handler({ credential, operation: "authorize-merge" }),
    ).resolves.toEqual({ accepted: true });
    expect(forward).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledWith();
  });

  it("rejects missing, forged and malformed credentials without forwarding", async () => {
    const forward = vi.fn(async () => ({}));
    const handler = createWorkerBrokerHandler(credential, forward);
    for (const input of [
      null,
      [],
      {},
      { credential: "b".repeat(64), operation: "authorize-merge" },
      { credential: "A".repeat(64), operation: "authorize-merge" },
      { credential, operation: "merge" },
      { credential, operation: "authorize-merge", humanId: 1 },
      { credential, operation: "authorize-merge", sipRevision: "forged" },
      { credential, operation: "authorize-merge", reviewId: 9 },
    ]) {
      await expect(handler(input)).rejects.toThrow();
    }
    expect(forward).not.toHaveBeenCalled();
  });

  it("rejects unsafe configured credentials", () => {
    expect(() => createWorkerBrokerHandler("short", async () => ({}))).toThrow(
      "Invalid broker worker credential",
    );
  });

  it("does not turn a failed forward into authorization", async () => {
    const handler = createWorkerBrokerHandler(credential, async () => {
      throw new Error("Writer unavailable");
    });
    await expect(
      handler({ credential, operation: "authorize-merge" }),
    ).rejects.toThrow("Writer unavailable");
  });
});
