import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
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
