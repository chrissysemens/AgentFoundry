import { describe, expect, it, vi } from "vitest";
import { createAuthenticatedMergeHandler } from "../src/authenticated-merge-ipc.ts";
import type { State } from "../src/domain.ts";

const secret = "a".repeat(64);

describe("authenticated merge IPC", () => {
  it("rejects missing, malformed and incorrect credentials before invoking evidence resolution", async () => {
    const trusted = vi.fn(async () => ({ ticket_id: "ticket" }) as State);
    const handler = createAuthenticatedMergeHandler(secret, trusted);
    await expect(
      handler({ request: { operation: "authorize-merge" } }),
    ).rejects.toThrow("Invalid authenticated request");
    await expect(
      handler({
        credential: "b".repeat(64),
        request: { operation: "authorize-merge" },
      }),
    ).rejects.toThrow("Authentication failed");
    await expect(
      handler({
        credential: secret,
        request: { operation: "authorize-merge" },
        actor: "human:forged",
      }),
    ).rejects.toThrow("Invalid authenticated request");
    expect(trusted).not.toHaveBeenCalled();
  });

  it("passes only the inner request to the trusted handler", async () => {
    const trusted = vi.fn(async () => ({ ticket_id: "ticket" }) as State);
    const handler = createAuthenticatedMergeHandler(secret, trusted);
    await expect(
      handler({
        credential: secret,
        request: { operation: "authorize-merge" },
      }),
    ).resolves.toMatchObject({ ticket_id: "ticket" });
    expect(trusted).toHaveBeenCalledWith({ operation: "authorize-merge" });
  });

  it("rejects weak or malformed startup secrets", () => {
    expect(() =>
      createAuthenticatedMergeHandler("password", async () => ({}) as State),
    ).toThrow("32 random bytes");
  });
});
