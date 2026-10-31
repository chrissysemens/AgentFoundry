import { describe, expect, it, vi } from "vitest";
import type { State } from "../src/domain.ts";
import type { Journal } from "../src/journal.ts";
import { VerifiedMergeAuthorizationWriter } from "../src/verified-merge-writer.ts";
import { createGitHubMergeAuthorizationResolver } from "../src/github-merge-authorization.ts";

const ticket = "FOUND-002";
const revision = "a".repeat(40);
const state = {
  ticket_id: ticket,
  status: "ACCEPTED",
  implementation_id: "impl-1",
  accepted_revision: revision,
  last_review_id: "review-1",
} as State;
const evidence = {
  ticket_id: ticket,
  implementation_id: "impl-1",
  code_revision: revision,
  review_id: "review-1",
  human_id: 123,
  authorized_at: "2026-10-31T12:00:00.000Z",
};
const payload = {
  implementation_id: "impl-1",
  code_revision: revision,
  review_id: "review-1",
};

function setup(decision: typeof evidence | undefined, current: State = state) {
  const append = vi.fn(() => ({ ...current, status: "MERGE_AUTHORIZED" }));
  const journal = { append, read: vi.fn(() => []) } as unknown as Journal;
  const resolve = vi.fn(async () => decision);
  const verifiedState = vi.fn(async () => current);
  const writer = new VerifiedMergeAuthorizationWriter(
    journal,
    ticket,
    [123],
    resolve,
    verifiedState,
  );
  return { writer, append, resolve, verifiedState };
}

describe("verified merge journal boundary", () => {
  it("never allows other journal events to bypass the merge gate", async () => {
    const { writer, append, resolve, verifiedState } = setup(evidence);
    for (const type of ["COMPLETED", "SIP_APPROVED", "ACCEPTED"]) {
      await expect(
        writer.append(ticket, type, "human:123", payload),
      ).rejects.toThrow("Merge writer only accepts MERGE_AUTHORIZED events");
    }
    expect(append).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(verifiedState).not.toHaveBeenCalled();
  });

  it("writes only after independent evidence and verified replay", async () => {
    const { writer, append, resolve, verifiedState } = setup(evidence);
    await writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload);
    expect(verifiedState).toHaveBeenCalledWith(ticket);
    expect(resolve).toHaveBeenCalledWith(ticket);
    expect(append).toHaveBeenCalledOnce();
  });

  it("rejects stale evidence, actor mismatch and payload tampering", async () => {
    const cases = [
      { decision: { ...evidence, review_id: "stale" } },
      { actor: "human:456" },
      { body: { ...payload, code_revision: "b".repeat(40) } },
      { current: { ...state, status: "REWORK" } },
    ];
    for (const scenario of cases) {
      const { writer, append } = setup(
        scenario.decision ?? evidence,
        scenario.current,
      );
      await expect(
        writer.append(
          ticket,
          "MERGE_AUTHORIZED",
          scenario.actor ?? "human:123",
          scenario.body ?? payload,
        ),
      ).rejects.toThrow();
      expect(append).not.toHaveBeenCalled();
    }
  });

  it("rejects missing evidence and cross-ticket writes", async () => {
    const { writer, append } = setup(undefined);
    await expect(
      writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload),
    ).rejects.toThrow();
    await expect(
      writer.append("OTHER", "MERGE_AUTHORIZED", "human:123", payload),
    ).rejects.toThrow();
    expect(append).not.toHaveBeenCalled();
  });

  it("blocks concurrent requests while independent evidence is pending", async () => {
    const { writer, append, resolve } = setup(evidence);
    let release: ((value: typeof evidence) => void) | undefined;
    resolve.mockImplementationOnce(
      () =>
        new Promise<typeof evidence>((done) => {
          release = done;
        }),
    );
    const first = writer.append(
      ticket,
      "MERGE_AUTHORIZED",
      "human:123",
      payload,
    );
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledOnce());
    await expect(
      writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload),
    ).rejects.toThrow("Concurrent merge writes forbidden");
    expect(append).not.toHaveBeenCalled();
    if (!release) throw new Error("Evidence resolver did not start");
    release(evidence);
    await first;
    expect(append).toHaveBeenCalledOnce();
  });

  it("releases its lock after a failed verification for a later retry", async () => {
    const { writer, append, resolve } = setup(evidence);
    resolve.mockRejectedValueOnce(new Error("Identity provider unavailable"));
    await expect(
      writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload),
    ).rejects.toThrow("Identity provider unavailable");
    expect(append).not.toHaveBeenCalled();
    await writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload);
    expect(append).toHaveBeenCalledOnce();
  });

  it("rejects forged or edited GitHub merge comments before journal append", async () => {
    const comment = {
      id: 456,
      issue_url: "https://api.github.com/repos/owner/repo/issues/7",
      user: { id: 123, type: "User" },
      created_at: evidence.authorized_at,
      updated_at: evidence.authorized_at,
      body: `MERGE AUTHORIZE ${ticket} impl-1 ${revision} review-1`,
    };
    for (const changed of [
      { updated_at: "2026-11-01T00:00:00.000Z" },
      { user: { id: 999, type: "User" } },
      { body: "approved" },
      { issue_url: "https://api.github.com/repos/owner/repo/issues/8" },
    ]) {
      const { append } = setup(evidence);
      const get = vi.fn(async () => ({ ...comment, ...changed }));
      const reader = { get: vi.fn(async () => evidence) };
      const resolve = createGitHubMergeAuthorizationResolver(
        get,
        reader,
        "owner/repo",
        7,
        456,
      );
      const journal = {
        append,
        read: vi.fn(() => []),
      } as unknown as Journal;
      const writer = new VerifiedMergeAuthorizationWriter(
        journal,
        ticket,
        [123],
        resolve,
        async () => state,
      );
      await expect(
        writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload),
      ).rejects.toThrow();
      expect(append).not.toHaveBeenCalled();
    }
  });

  it("accepts a matching authenticated GitHub comment and retained decision", async () => {
    const get = vi.fn(async () => ({
      id: 456,
      issue_url: "https://api.github.com/repos/owner/repo/issues/7",
      user: { id: 123, type: "User" },
      created_at: evidence.authorized_at,
      updated_at: evidence.authorized_at,
      body: `MERGE AUTHORIZE ${ticket} impl-1 ${revision} review-1`,
    }));
    const reader = { get: vi.fn(async () => evidence) };
    const resolve = createGitHubMergeAuthorizationResolver(
      get,
      reader,
      "owner/repo",
      7,
      456,
    );
    const append = vi.fn(() => state);
    const journal = { append, read: vi.fn(() => []) } as unknown as Journal;
    const writer = new VerifiedMergeAuthorizationWriter(
      journal,
      ticket,
      [123],
      resolve,
      async () => state,
    );
    await writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload);
    expect(reader.get).toHaveBeenCalledWith("owner/repo", 456);
    expect(append).toHaveBeenCalledOnce();
  });

  it("rejects malformed retained merge decisions before writing", async () => {
    const comment = {
      id: 456,
      issue_url: "https://api.github.com/repos/owner/repo/issues/7",
      user: { id: 123, type: "User" },
      created_at: evidence.authorized_at,
      updated_at: evidence.authorized_at,
      body: `MERGE AUTHORIZE ${ticket} impl-1 ${revision} review-1`,
    };
    for (const changed of [
      { ticket_id: "OTHER" },
      { human_id: 999 },
      { code_revision: "invalid" },
      { authorized_at: "2026-10-30T12:00:00.000Z" },
    ]) {
      const get = vi.fn(async () => comment);
      const reader = { get: vi.fn(async () => ({ ...evidence, ...changed })) };
      const resolve = createGitHubMergeAuthorizationResolver(
        get,
        reader,
        "owner/repo",
        7,
        456,
      );
      const append = vi.fn(() => state);
      const journal = { append, read: vi.fn(() => []) } as unknown as Journal;
      const writer = new VerifiedMergeAuthorizationWriter(
        journal,
        ticket,
        [123],
        resolve,
        async () => state,
      );
      await expect(
        writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload),
      ).rejects.toThrow();
      expect(append).not.toHaveBeenCalled();
    }
  });

  it("fails closed when retained merge evidence cannot be read", async () => {
    const get = vi.fn(async () => ({
      id: 456,
      issue_url: "https://api.github.com/repos/owner/repo/issues/7",
      user: { id: 123, type: "User" },
      created_at: evidence.authorized_at,
      updated_at: evidence.authorized_at,
      body: `MERGE AUTHORIZE ${ticket} impl-1 ${revision} review-1`,
    }));
    const reader = {
      get: vi.fn(async (): Promise<typeof evidence> => {
        throw new Error("Independent retention service unavailable");
      }),
    };
    const resolve = createGitHubMergeAuthorizationResolver(
      get,
      reader,
      "owner/repo",
      7,
      456,
    );
    const append = vi.fn(() => state);
    const journal = { append, read: vi.fn(() => []) } as unknown as Journal;
    const writer = new VerifiedMergeAuthorizationWriter(
      journal,
      ticket,
      [123],
      resolve,
      async () => state,
    );
    await expect(
      writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload),
    ).rejects.toThrow("Independent retention service unavailable");
    expect(append).not.toHaveBeenCalled();
  });

  it("does not append when independent verification fails", async () => {
    const { writer, append, verifiedState } = setup(evidence);
    verifiedState.mockRejectedValueOnce(new Error("Untrusted SIP history"));
    await expect(
      writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload),
    ).rejects.toThrow("Untrusted SIP history");
    expect(append).not.toHaveBeenCalled();
  });
  it("uses conditional append after verification in atomic mode", async () => {
    const snapshot = {
      ...state,
      history: [{ event_id: "snapshot-1" }],
    } as State;
    const conditional = vi.fn(() => state);
    const ordinary = vi.fn(() => state);
    const journal = {
      append: ordinary,
      read: vi.fn(() => []),
      appendIfLastEventMatches: conditional,
    } as unknown as Journal;
    const writer = new VerifiedMergeAuthorizationWriter(
      journal,
      ticket,
      [123],
      async () => evidence,
      async () => snapshot,
      true,
    );
    await writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload);
    expect(conditional).toHaveBeenCalledWith(
      ticket,
      "snapshot-1",
      "MERGE_AUTHORIZED",
      "human:123",
      payload,
    );
    expect(ordinary).not.toHaveBeenCalled();
  });

  it("fails closed in atomic mode without a verified snapshot", async () => {
    const ordinary = vi.fn(() => state);
    const journal = {
      append: ordinary,
      read: vi.fn(() => []),
    } as unknown as Journal;
    const writer = new VerifiedMergeAuthorizationWriter(
      journal,
      ticket,
      [123],
      async () => evidence,
      async () => state,
      true,
    );
    await expect(
      writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload),
    ).rejects.toThrow("Verified journal snapshot required for atomic merge");
    expect(ordinary).not.toHaveBeenCalled();
  });
  it("propagates a stale-snapshot rejection without falling back to append", async () => {
    const snapshot = {
      ...state,
      history: [{ event_id: "snapshot-1" }],
    } as State;
    const ordinary = vi.fn(() => state);
    const conditional = vi.fn((): State => {
      throw new Error("Journal changed since authorization verification");
    });
    const journal = {
      append: ordinary,
      read: vi.fn(() => []),
      appendIfLastEventMatches: conditional,
    } as unknown as Journal;
    const writer = new VerifiedMergeAuthorizationWriter(
      journal,
      ticket,
      [123],
      async () => evidence,
      async () => snapshot,
      true,
    );
    await expect(
      writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload),
    ).rejects.toThrow("Journal changed since authorization verification");
    expect(conditional).toHaveBeenCalledOnce();
    expect(ordinary).not.toHaveBeenCalled();
  });
  it("rejects a journal without transactional append in atomic mode", async () => {
    const snapshot = {
      ...state,
      history: [{ event_id: "snapshot-1" }],
    } as State;
    const ordinary = vi.fn(() => state);
    const journal = {
      append: ordinary,
      read: vi.fn(() => []),
    } as unknown as Journal;
    const writer = new VerifiedMergeAuthorizationWriter(
      journal,
      ticket,
      [123],
      async () => evidence,
      async () => snapshot,
      true,
    );
    await expect(
      writer.append(ticket, "MERGE_AUTHORIZED", "human:123", payload),
    ).rejects.toThrow("Atomic merge journal unavailable");
    expect(ordinary).not.toHaveBeenCalled();
  });
});
