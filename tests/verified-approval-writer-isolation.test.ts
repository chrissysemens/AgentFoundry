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
      "ticket",
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

  it("keeps unrelated ticket histories isolated", async () => {
    const gateway: TrustedGitHubApprovalGateway = {
      async fetchComment() {
        throw new Error("Evidence unavailable");
      },
      async fetchSipAtCommit() {
        throw new Error("SIP unavailable");
      },
      async verifyAttestation() {
        return undefined;
      },
    };
    let journal: MemoryJournal | undefined;
    const writer = new VerifiedApprovalWriter(
      (verify) => {
        journal = new MemoryJournal(verify);
        return journal;
      },
      policy,
      gateway,
      "ticket",
    );
    await writer.append("ticket", "TICKET_CREATED", "human:owner", {
      title: "Alpha",
    });
    await expect(
      writer.append("beta", "TICKET_CREATED", "human:owner", {
        title: "Beta",
      }),
    ).rejects.toThrow("Ticket does not match trusted approval binding");
    await expect(
      writer.append("ticket", "SIP_APPROVED", "human:owner", {
        receipt: { ...fixtureReceipt, source_event_id: "123" },
      }),
    ).rejects.toThrow("Evidence unavailable");
    const state = await writer.append("ticket", "GRILL_STARTED", "agent:planner");
    expect(state.title).toBe("Alpha");
    expect(journal?.read("ticket")).toHaveLength(2);
    expect(journal?.read("beta")).toHaveLength(0);
  });

  it("rejects a forged historical approval inserted outside the verified writer", async () => {
    const gateway: TrustedGitHubApprovalGateway = {
      async fetchComment() {
        throw new Error("Forged historical approval has no evidence");
      },
      async fetchSipAtCommit() {
        throw new Error("SIP unavailable");
      },
      async verifyAttestation() {
        return undefined;
      },
    };
    let journal: MemoryJournal | undefined;
    const writer = new VerifiedApprovalWriter(
      (verify) => {
        journal = new MemoryJournal(verify);
        return journal;
      },
      policy,
      gateway,
      "ticket",
    );
    await writer.append("ticket", "TICKET_CREATED", "human:owner", {
      title: "Bypass attempt",
    });
    await writer.append("ticket", "GRILL_STARTED", "agent:planner");
    await writer.append("ticket", "SIP_PROPOSED", "agent:planner", {
      revision: "2",
      sha256: fixtureReceipt.sip_sha256,
    });
    await expect(
      writer.append("ticket", "SIP_APPROVED", "human:owner", {
        revision: "2",
        sha256: fixtureReceipt.sip_sha256,
        receipt: { ...fixtureReceipt, source_event_id: "123" },
      }),
    ).rejects.toThrow("Forged historical approval has no evidence");
    expect(journal?.read("ticket")).toHaveLength(3);
  });
});
