import { describe, expect, it, vi } from "vitest";
import { createTrustedMergeRequestHandler } from "../src/trusted-merge-request.ts";
import type { TrustedMergeService } from "../src/trusted-merge-service.ts";
import type { State } from "../src/domain.ts";

describe("trusted merge request surface", () => {
  it("derives all authorization fields from trusted resolver, never caller payload", async () => {
    const result = {} as State;
    const authorizeMerge = vi.fn(async () => result);
    const resolve = vi.fn(async () => ({
      humanId: 123,
      implementationId: "implementation",
      codeRevision: "commit",
      reviewId: "oracle",
    }));
    const handler = createTrustedMergeRequestHandler(
      { authorizeMerge } as unknown as TrustedMergeService,
      "FOUND-002",
      resolve,
    );
    await expect(handler({ operation: "authorize-merge" })).resolves.toBe(result);
    expect(authorizeMerge).toHaveBeenCalledWith("FOUND-002", "human:123", {
      implementation_id: "implementation",
      code_revision: "commit",
      review_id: "oracle",
    });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("rejects caller-selected ticket, actor, evidence and unknown operations", async () => {
    const authorizeMerge = vi.fn();
    const resolve = vi.fn();
    const handler = createTrustedMergeRequestHandler(
      { authorizeMerge } as unknown as TrustedMergeService,
      "FOUND-002",
      resolve,
    );
    for (const request of [
      null, [], {}, { operation: "append" },
      { operation: "authorize-merge", ticket: "other" },
      { operation: "authorize-merge", actor: "human:forged" },
      { operation: "authorize-merge", payload: { code_revision: "forged" } },
    ]) {
      await expect(handler(request)).rejects.toThrow("Invalid trusted merge request");
    }
    expect(resolve).not.toHaveBeenCalled();
    expect(authorizeMerge).not.toHaveBeenCalled();
  });

  it("fails closed when independently verified evidence is unavailable", async () => {
    const authorizeMerge = vi.fn();
    const handler = createTrustedMergeRequestHandler(
      { authorizeMerge } as unknown as TrustedMergeService,
      "FOUND-002",
      async () => { throw new Error("Evidence unavailable"); },
    );
    await expect(handler({ operation: "authorize-merge" })).rejects.toThrow("Evidence unavailable");
    expect(authorizeMerge).not.toHaveBeenCalled();
  });
});
