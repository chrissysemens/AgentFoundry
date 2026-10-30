import { describe, expect, it } from "vitest";

import { MemoryJournal } from "../src/journal.ts";
import { VerifiedApprovalWriter } from "../src/verified-approval-writer.ts";
import type { TrustedGitHubApprovalGateway } from "../src/github-approval-resolver.ts";
import { fixtureReceipt } from "./approval-fixture.ts";

const policy = {
  repository: "owner/repo",
  issue_number: 1,
  allowed_human_ids: [123],
};

describe("verified approval writer isolation", () => {
  it("rejects overlapping writes while evidence is pending", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gateway: TrustedGitHubApprovalGateway = {
      async fetchComment() {
        await pending;
        throw new Error("Evidence unavailable");
      },
      async fetchSipAtCommit() {
        throw new Error("SIP unavailable");
      },
      async verifyAttestation() {
        return undefined;
      },
    };
    const writer = new VerifiedApprovalWriter(
      (verify) => new MemoryJournal(verify),
      policy,
      gateway,
    );
    const first = writer.append("ticket", "SIP_APPROVED", "human:owner", {
      receipt: { ...fixtureReceipt, source_event_id: "123" },
    });
    await expect(
      writer.append("ticket", "TICKET_CREATED", "human:owner", {
        title: "Concurrent",
      }),
    ).rejects.toThrow("Concurrent verified writes forbidden");
    release?.();
    await expect(first).rejects.toThrow("Evidence unavailable");
    const state = await writer.append(
      "ticket",
      "TICKET_CREATED",
      "human:owner",
      { title: "Recovered" },
    );
    expect(state.title).toBe("Recovered");
  });
});
