import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { digest } from "../src/domain.ts";
import { MemoryJournal, SQLiteJournal } from "../src/journal.ts";
import { approvalAttestationSigningBytes } from "../src/signed-approval-attestation.ts";
import { createVerifiedGitHubApprovalGateway } from "../src/verified-github-approval-gateway.ts";
import { VerifiedApprovalWriter } from "../src/verified-approval-writer.ts";
import type { ApprovalAttestation } from "../src/github-approval-evidence.ts";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const sip = "# Approved SIP\n";
const sha = "a".repeat(40);
const payload: ApprovalAttestation = {
  repository: "owner/repo",
  issue_number: 7,
  comment_id: 456,
  author_id: 123,
  sip_revision: "3",
  sip_git_sha: sha,
  sip_sha256: digest(sip),
  approved_at: "2020-01-01T00:00:00.000Z",
};
const receipt = {
  sip_revision: payload.sip_revision,
  sip_git_sha: sha,
  sip_sha256: payload.sip_sha256,
  approver_id: "123",
  source_event_id: "456",
  source: "github-issue-comment",
  approved_at: payload.approved_at,
};
const trust = {
  trusted_keys: {
    operator: publicKey.export({ type: "spki", format: "pem" }).toString(),
  },
};
const policy = {
  repository: "owner/repo",
  issue_number: 7,
  allowed_human_ids: [123],
};

function buildWriter(tamper = false) {
  let journal: MemoryJournal | undefined;
  const signed = {
    payload: tamper ? { ...payload, author_id: 999 } : payload,
    key_id: "operator",
    signature_base64: sign(
      null,
      approvalAttestationSigningBytes(payload),
      privateKey,
    ).toString("base64"),
  };
  const get = async (path: string): Promise<unknown> => {
    if (path.endsWith("/issues/comments/456")) {
      return {
        id: 456,
        issue_url: "https://api.github.com/repos/owner/repo/issues/7",
        user: { id: 123, type: "User" },
        created_at: payload.approved_at,
        updated_at: payload.approved_at,
        body: `Approved revision 3 at ${sha} digest ${payload.sip_sha256}`,
      };
    }
    return {
      type: "file",
      encoding: "base64",
      content: Buffer.from(sip).toString("base64"),
    };
  };
  const gateway = createVerifiedGitHubApprovalGateway(
    get,
    "docs/SIP.md",
    "3",
    { get: async () => signed },
    trust,
  );
  const writer = new VerifiedApprovalWriter(
    (verify) => {
      journal = new MemoryJournal(verify);
      return journal;
    },
    policy,
    gateway,
    "ticket",
  );
  return { writer, read: () => journal?.read("ticket") ?? [] };
}

describe("signed approval to journal integration", () => {
  it("records approval only after authenticating signed evidence", async () => {
    const { writer, read } = buildWriter();
    await writer.append("ticket", "TICKET_CREATED", "human:owner", {
      title: "Approved work",
    });
    await writer.append("ticket", "GRILL_STARTED", "agent:planner");
    await writer.append("ticket", "SIP_PROPOSED", "agent:planner", {
      revision: "3",
      sha256: payload.sip_sha256,
    });
    const state = await writer.append("ticket", "SIP_APPROVED", "human:owner", {
      revision: "3",
      sha256: payload.sip_sha256,
      receipt,
    });
    expect(state.status).toBe("APPROVED");
    expect(read()).toHaveLength(4);
  });

  it("rejects cross-ticket reuse of a valid signed approval", async () => {
    const { writer, read } = buildWriter();
    await writer.append("ticket", "TICKET_CREATED", "human:owner", {
      title: "Original approved ticket",
    });
    await writer.append("ticket", "GRILL_STARTED", "agent:planner");
    await writer.append("ticket", "SIP_PROPOSED", "agent:planner", {
      revision: "3",
      sha256: payload.sip_sha256,
    });
    await writer.append("ticket", "SIP_APPROVED", "human:owner", {
      revision: "3",
      sha256: payload.sip_sha256,
      receipt,
    });
    expect(read()).toHaveLength(4);
    await expect(
      writer.append("other-ticket", "SIP_APPROVED", "human:owner", {
        revision: "3",
        sha256: payload.sip_sha256,
        receipt,
      }),
    ).rejects.toThrow("Ticket does not match trusted approval binding");
    await expect(
      writer.append("other-ticket", "TICKET_CREATED", "human:owner", {
        title: "Unauthorized second ticket",
      }),
    ).rejects.toThrow("Ticket does not match trusted approval binding");
    expect(read()).toHaveLength(4);
  });

  it("rejects tampered signed evidence without recording approval", async () => {
    const { writer, read } = buildWriter(true);
    await writer.append("ticket", "TICKET_CREATED", "human:owner", {
      title: "Tamper test",
    });
    await writer.append("ticket", "GRILL_STARTED", "agent:planner");
    await writer.append("ticket", "SIP_PROPOSED", "agent:planner", {
      revision: "3",
      sha256: payload.sip_sha256,
    });
    await expect(
      writer.append("ticket", "SIP_APPROVED", "human:owner", {
        revision: "3",
        sha256: payload.sip_sha256,
        receipt,
      }),
    ).rejects.toThrow("Invalid approval attestation signature");
    expect(read()).toHaveLength(3);
  });

  it("requires fresh evidence before subsequent writes", async () => {
    let available = true;
    const signed = {
      payload,
      key_id: "operator",
      signature_base64: sign(
        null,
        approvalAttestationSigningBytes(payload),
        privateKey,
      ).toString("base64"),
    };
    const get = async (path: string): Promise<unknown> => {
      if (path.endsWith("/issues/comments/456")) {
        return {
          id: 456,
          issue_url: "https://api.github.com/repos/owner/repo/issues/7",
          user: { id: 123, type: "User" },
          created_at: payload.approved_at,
          updated_at: payload.approved_at,
          body: `Approved revision 3 at ${sha} digest ${payload.sip_sha256}`,
        };
      }
      return {
        type: "file",
        encoding: "base64",
        content: Buffer.from(sip).toString("base64"),
      };
    };
    const gateway = createVerifiedGitHubApprovalGateway(
      get,
      "docs/SIP.md",
      "3",
      { get: async () => (available ? signed : undefined) },
      trust,
    );
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
      title: "Revocation test",
    });
    await writer.append("ticket", "GRILL_STARTED", "agent:planner");
    await writer.append("ticket", "SIP_PROPOSED", "agent:planner", {
      revision: "3",
      sha256: payload.sip_sha256,
    });
    await writer.append("ticket", "SIP_APPROVED", "human:owner", {
      revision: "3",
      sha256: payload.sip_sha256,
      receipt,
    });
    available = false;
    await expect(
      writer.append("ticket", "IMPLEMENTATION_STARTED", "agent:dev", {
        revision: "3",
        sha256: payload.sip_sha256,
        implementation_id: "implementation-1",
      }),
    ).rejects.toThrow("Immutable approval attestation required");
    expect(journal?.read("ticket")).toHaveLength(4);
  });
  it("reverifies two independently signed SIP revisions across SQLite restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "foundry-multi-revision-"));
    const path = join(directory, "events.sqlite");
    const secondSip = "# Revised SIP\\n";
    const secondSha = "b".repeat(40);
    const secondPayload: ApprovalAttestation = {
      ...payload,
      comment_id: 457,
      sip_revision: "4",
      sip_git_sha: secondSha,
      sip_sha256: digest(secondSip),
    };
    const secondReceipt = {
      ...receipt,
      sip_revision: "4",
      sip_git_sha: secondSha,
      sip_sha256: secondPayload.sip_sha256,
      source_event_id: "457",
    };
    const attestations = new Map([
      [456, payload],
      [457, secondPayload],
    ]);
    let revoked = false;
    const get = async (requestPath: string): Promise<unknown> => {
      if (requestPath.includes("/issues/comments/")) {
        const id = Number(requestPath.split("/").pop());
        const approved = attestations.get(id);
        if (!approved) throw new Error("Unknown approval comment");
        return {
          id,
          issue_url: "https://api.github.com/repos/owner/repo/issues/7",
          user: { id: 123, type: "User" },
          created_at: approved.approved_at,
          updated_at: approved.approved_at,
          body: `Approved revision ${approved.sip_revision} at ${approved.sip_git_sha} digest ${approved.sip_sha256}`,
        };
      }
      return {
        type: "file",
        encoding: "base64",
        content: Buffer.from(requestPath.endsWith(secondSha) ? secondSip : sip).toString("base64"),
      };
    };
    const gateway = createVerifiedGitHubApprovalGateway(
      get,
      "docs/SIP.md",
      "4",
      {
        get: async (_repository, commentId) => {
          const approved = attestations.get(commentId);
          if (!approved || (revoked && commentId === 456)) return undefined;
          return {
            payload: approved,
            key_id: "operator",
            signature_base64: sign(
              null,
              approvalAttestationSigningBytes(approved),
              privateKey,
            ).toString("base64"),
          };
        },
      },
      trust,
      { [sha]: "3", [secondSha]: "4" },
    );
    const holder: { journal?: SQLiteJournal } = {};
    const openWriter = () =>
      new VerifiedApprovalWriter(
        (verify) => {
          holder.journal = new SQLiteJournal(path, verify);
          return holder.journal;
        },
        policy,
        gateway,
        "ticket",
      );
    try {
      const first = openWriter();
      await first.append("ticket", "TICKET_CREATED", "human:owner", { title: "Two revisions" });
      await first.append("ticket", "GRILL_STARTED", "agent:planner");
      await first.append("ticket", "SIP_PROPOSED", "agent:planner", { revision: "3", sha256: payload.sip_sha256 });
      await first.append("ticket", "SIP_APPROVED", "human:owner", { revision: "3", sha256: payload.sip_sha256, receipt });
      await first.append("ticket", "IMPLEMENTATION_STARTED", "agent:dev", {
        revision: "3",
        sha256: payload.sip_sha256,
        implementation_id: "first-implementation",
      });
      await first.append("ticket", "ESCALATED", "agent:planner", { reason: "REDESIGN" });
      await first.append("ticket", "SIP_PROPOSED", "agent:planner", { revision: "4", sha256: secondPayload.sip_sha256 });
      const approved = await first.append("ticket", "SIP_APPROVED", "human:owner", {
        revision: "4",
        sha256: secondPayload.sip_sha256,
        receipt: secondReceipt,
      });
      expect(approved.approved_revision).toBe("4");
      expect(holder.journal?.read("ticket")).toHaveLength(8);
      holder.journal?.close();
      holder.journal = undefined;

      const restarted = openWriter();
      const resumed = await restarted.append("ticket", "IMPLEMENTATION_STARTED", "agent:dev", {
        revision: "4",
        sha256: secondPayload.sip_sha256,
        implementation_id: "second-implementation",
      });
      expect(resumed.status).toBe("IMPLEMENTING");
      expect(resumed.approved_revision).toBe("4");
      expect(holder.journal?.read("ticket")).toHaveLength(9);
      revoked = true;
      await expect(
        restarted.append("ticket", "CODE_SUBMITTED", "agent:dev", {
          implementation_id: "second-implementation",
          code_revision: "c".repeat(40),
        }),
      ).rejects.toThrow("Immutable approval attestation required");
      expect(holder.journal?.read("ticket")).toHaveLength(9);
    } finally {
      holder.journal?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reverifies signed historical approvals after SQLite restart and blocks revoked evidence", async () => {
    const directory = mkdtempSync(join(tmpdir(), "foundry-signed-restart-"));
    const path = join(directory, "events.sqlite");
    const signed = {
      payload,
      key_id: "operator",
      signature_base64: sign(
        null,
        approvalAttestationSigningBytes(payload),
        privateKey,
      ).toString("base64"),
    };
    let available = true;
    const get = async (requestPath: string): Promise<unknown> => {
      if (requestPath.endsWith("/issues/comments/456")) {
        return {
          id: 456,
          issue_url: "https://api.github.com/repos/owner/repo/issues/7",
          user: { id: 123, type: "User" },
          created_at: payload.approved_at,
          updated_at: payload.approved_at,
          body: `Approved revision 3 at ${sha} digest ${payload.sip_sha256}`,
        };
      }
      return {
        type: "file",
        encoding: "base64",
        content: Buffer.from(sip).toString("base64"),
      };
    };
    const gateway = createVerifiedGitHubApprovalGateway(
      get,
      "docs/SIP.md",
      "3",
      { get: async () => (available ? signed : undefined) },
      trust,
    );
    const holder: { journal?: SQLiteJournal } = {};
    const openWriter = () =>
      new VerifiedApprovalWriter(
        (verify) => {
          holder.journal = new SQLiteJournal(path, verify);
          return holder.journal;
        },
        policy,
        gateway,
        "ticket",
      );
    const count = () => holder.journal?.read("ticket").length ?? 0;
    try {
      const first = openWriter();
      await first.append("ticket", "TICKET_CREATED", "human:owner", {
        title: "Restart security",
      });
      await first.append("ticket", "GRILL_STARTED", "agent:planner");
      await first.append("ticket", "SIP_PROPOSED", "agent:planner", {
        revision: "3",
        sha256: payload.sip_sha256,
      });
      await first.append("ticket", "SIP_APPROVED", "human:owner", {
        revision: "3",
        sha256: payload.sip_sha256,
        receipt,
      });
      expect(count()).toBe(4);
      holder.journal?.close();
      holder.journal = undefined;

      available = false;
      const restarted = openWriter();
      await expect(
        restarted.append("ticket", "IMPLEMENTATION_STARTED", "agent:dev", {
          revision: "3",
          sha256: payload.sip_sha256,
          implementation_id: "restart-implementation",
        }),
      ).rejects.toThrow("Immutable approval attestation required");
      expect(count()).toBe(4);

      available = true;
      const state = await restarted.append(
        "ticket",
        "IMPLEMENTATION_STARTED",
        "agent:dev",
        {
          revision: "3",
          sha256: payload.sip_sha256,
          implementation_id: "restart-implementation",
        },
      );
      expect(state.status).toBe("IMPLEMENTING");
      expect(count()).toBe(5);
    } finally {
      holder.journal?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
