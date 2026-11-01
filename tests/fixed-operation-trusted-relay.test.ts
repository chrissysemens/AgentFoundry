import { describe, expect, it, vi } from "vitest";
import { createFixedOperationTrustedRelay } from "../src/fixed-operation-trusted-relay.js";

const credential = "a".repeat(64);
const request = { credential, operation: "authorize-merge" };

describe("fixed-operation trusted relay", () => {
  it("forwards only a fixed operation with no worker-controlled arguments", async () => {
    const send = vi.fn(async () => ({ authorized: false }));
    const relay = createFixedOperationTrustedRelay(credential, send);
    await expect(relay(request)).resolves.toEqual({ authorized: false });
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith();
  });

  it("rejects invalid or worker-selected fields without forwarding", async () => {
    const send = vi.fn(async () => ({}));
    const relay = createFixedOperationTrustedRelay(credential, send);
    for (const bad of [
      null,
      [],
      {},
      { ...request, credential: "b".repeat(64) },
      { ...request, ticket: "injected" },
      { ...request, operation: "merge" },
      { ...request, credential: "not-hex" },
    ]) {
      await expect(relay(bad)).rejects.toThrow();
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects concurrent requests and resets after failure", async () => {
    let rejectFirst: (error: Error) => void = () => {};
    const send = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValueOnce({ ok: true });
    const relay = createFixedOperationTrustedRelay(credential, send);
    const pending = relay(request);
    await expect(relay(request)).rejects.toThrow("in progress");
    rejectFirst(new Error("Writer unavailable"));
    await expect(pending).rejects.toThrow("Writer unavailable");
    await expect(relay(request)).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid deployment credentials", () => {
    expect(() =>
      createFixedOperationTrustedRelay("invalid", async () => ({})),
    ).toThrow();
  });
});
