import { describe, expect, it } from "vitest";
import { startCrossUidMergeBridge } from "../src/cross-uid-merge-bridge.ts";

describe("cross-UID bridge configuration", () => {
  it("rejects relative paths before binding", async () => {
    await expect(
      startCrossUidMergeBridge(
        "public.sock",
        "/private/writer.sock",
        "a".repeat(64),
        1234,
      ),
    ).rejects.toThrow("Unsafe cross-UID bridge configuration");
  });

  it("rejects caller-supplied malformed credentials", async () => {
    await expect(
      startCrossUidMergeBridge(
        "/tmp/public.sock",
        "/private/writer.sock",
        "invalid",
        1234,
      ),
    ).rejects.toThrow("Unsafe cross-UID bridge configuration");
  });

  it("rejects identical public and private socket paths", async () => {
    await expect(
      startCrossUidMergeBridge(
        "/tmp/agent-foundry-same.sock",
        "/tmp/agent-foundry-same.sock",
        "a".repeat(64),
        1234,
      ),
    ).rejects.toThrow("Unsafe cross-UID bridge configuration");
  });

  it.skipIf(process.platform !== "linux" || process.getuid?.() !== 0)(
    "rejects a privileged root bridge identity",
    async () => {
      await expect(
        startCrossUidMergeBridge(
          "/tmp/agent-foundry-bridge.sock",
          "/tmp/agent-foundry-writer.sock",
          "a".repeat(64),
          1234,
        ),
      ).rejects.toThrow("Unsafe cross-UID bridge configuration");
    },
  );
});
