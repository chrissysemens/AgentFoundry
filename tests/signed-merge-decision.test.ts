import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { State } from "../src/domain.ts";
import type { Journal } from "../src/journal.ts";
import { createSignedGitHubMergeAuthorizationResolver } from "../src/github-merge-authorization.ts";
import { VerifiedMergeAuthorizationWriter } from "../src/verified-merge-writer.ts";
import {
  mergeDecisionSigningBytes,
  verifySignedMergeDecision,
} from "../src/signed-merge-decision.ts";

const repository = "owner/repo";
const issue = 7;
const comment = 456;
const payload = {
  repository,
  issue_number: issue,
  comment_id: comment,
  ticket_id: "FOUND-002",
  implementation_id: "impl-1",
  code_revision: "a".repeat(40),
  review_id: "oracle-1",
  human_id: 123,
  authorized_at: "2026-10-31T12:00:00.000Z",
};

describe("signed merge decision verification", () => {
  it("gates journal writes on signed GitHub evidence", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const trust = {
      trusted_keys: {
        "operator-1": publicKey.export({ type: "spki", format: "pem" }).toString(),
      },
    };
    const entry = {
      payload,
      key_id: "operator-1",
      signature_base64: sign(null, mergeDecisionSigningBytes(payload), privateKey).toString("base64"),
    };
    const get = vi.fn(async () => ({
      id: comment,
      issue_url: "https://api.github.com/repos/owner/repo/issues/7",
      user: { id: 123, type: "User" },
      created_at: payload.authorized_at,
      updated_at: payload.authorized_at,
      body: `MERGE AUTHORIZE ${payload.ticket_id} ${payload.implementation_id} ${payload.code_revision} ${payload.review_id}`,
    }));
    let retained: unknown = entry;
    const store = { get: vi.fn(async () => retained) };
    const resolver = createSignedGitHubMergeAuthorizationResolver(
      get, store, trust, repository, issue, comment,
    );
    const current = {
      ticket_id: payload.ticket_id,
      status: "ACCEPTED",
      implementation_id: payload.implementation_id,
      accepted_revision: payload.code_revision,
      last_review_id: payload.review_id,
    } as State;
    const append = vi.fn(() => current);
    const journal = { append, read: vi.fn(() => []) } as unknown as Journal;
    const writer = new VerifiedMergeAuthorizationWriter(
      journal, payload.ticket_id, [123], resolver, async () => current,
    );
    const eventPayload = {
      implementation_id: payload.implementation_id,
      code_revision: payload.code_revision,
      review_id: payload.review_id,
    };
    await writer.append(payload.ticket_id, "MERGE_AUTHORIZED", "human:123", eventPayload);
    expect(append).toHaveBeenCalledOnce();
    retained = { ...entry, payload: { ...payload, review_id: "forged" } };
    await expect(
      writer.append(payload.ticket_id, "MERGE_AUTHORIZED", "human:123", eventPayload),
    ).rejects.toThrow("Invalid merge decision signature");
    expect(append).toHaveBeenCalledOnce();
  });

  it("accepts a valid Ed25519 decision and rejects tampering and replay", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicPem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const signature_base64 = sign(
      null,
      mergeDecisionSigningBytes(payload),
      privateKey,
    ).toString("base64");
    const entry = { payload, key_id: "operator-1", signature_base64 };
    const trust = { trusted_keys: { "operator-1": publicPem } };
    const store = { get: async () => entry };
    await expect(
      verifySignedMergeDecision(store, trust, repository, issue, comment),
    ).resolves.toMatchObject(payload);
    await expect(
      verifySignedMergeDecision(store, trust, repository, issue, 999),
    ).rejects.toThrow();
    await expect(
      verifySignedMergeDecision(
        {
          get: async () => ({
            ...entry,
            payload: { ...payload, review_id: "forged" },
          }),
        },
        trust,
        repository,
        issue,
        comment,
      ),
    ).rejects.toThrow("Invalid merge decision signature");
    await expect(
      verifySignedMergeDecision(
        store,
        { trusted_keys: {} },
        repository,
        issue,
        comment,
      ),
    ).rejects.toThrow("Untrusted merge decision signing key");
  });
});
