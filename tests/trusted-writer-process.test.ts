import { describe, expect, it } from "vitest";
import { runTrustedWriterProcess } from "../src/trusted-writer-process.ts";
import type { State } from "../src/domain.ts";

describe("trusted writer process startup", () => {
  it("fails closed on a missing credential before registering signal handlers", async () => {
    const before = process.listenerCount("SIGTERM");
    await expect(
      runTrustedWriterProcess(
        "/tmp/foundry-missing-db/events.sqlite",
        "/tmp/foundry-missing-socket/writer.sock",
        "/tmp/foundry-missing-credential",
        async () => ({} as State),
      ),
    ).rejects.toThrow();
    expect(process.listenerCount("SIGTERM")).toBe(before);
  });
});
