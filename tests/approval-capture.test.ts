import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { captureApprovalEvidence } from "../src/approval-capture.ts";
import { digest } from "../src/domain.ts";

const { privateKey } = generateKeyPairSync("ed25519");
const sha = "a".repeat(40);
const sip = { revision: "3", git_sha: sha, utf8_content: "# Approved SIP\n" };
const time = "2026-10-30T00:00:00.000Z";
const event = {
  repository: "owner/repo",
  issue_number: 7,
  comment_id: 456,
  author_id: 123,
  author_type: "User",
  created_at: time,
  updated_at: time,
  body: `Approved revision 3 at ${sha} digest ${digest(sip.utf8_content)}`,
};
const policy = { repository: "owner/repo", issue_number: 7, allowed_human_ids: [123] };
const signer = {
  keyId: "operator",
  signApproval: async (bytes: Buffer) => sign(null, bytes, privateKey),
};

describe("approval capture", () => {
  it("signs exact authenticated SIP identity and writes once", async () => {
    const createOnce = vi.fn(async () => {});
    const signed = await captureApprovalEvidence(event, sip, policy, signer, { createOnce });
    expect(signed.payload.sip_sha256).toBe(digest(sip.utf8_content));
    expect(createOnce).toHaveBeenCalledWith("owner/repo", 456, signed);
    expect(signed.signature_base64).toBeTruthy();
  });

  it("does not sign or store edited or unauthorized comments", async () => {
    const signApproval = vi.fn(signer.signApproval);
    const createOnce = vi.fn(async () => {});
    await expect(captureApprovalEvidence(
      { ...event, updated_at: "2026-10-31T00:00:00.000Z" },
      sip,
      policy,
      { keyId: "operator", signApproval },
      { createOnce },
    )).rejects.toThrow("Approval capture source is not trusted");
    expect(signApproval).not.toHaveBeenCalled();
    expect(createOnce).not.toHaveBeenCalled();
  });

  it("rejects a changed SIP digest before signing", async () => {
    const createOnce = vi.fn(async () => {});
    await expect(captureApprovalEvidence(
      event,
      { ...sip, utf8_content: "# Tampered SIP\n" },
      policy,
      signer,
      { createOnce },
    )).rejects.toThrow("Approval capture source is not trusted");
    expect(createOnce).not.toHaveBeenCalled();
  });

  it("propagates write-once storage failures", async () => {
    await expect(captureApprovalEvidence(
      event,
      sip,
      policy,
      signer,
      { createOnce: async () => { throw new Error("Object already exists"); } },
    )).rejects.toThrow("Object already exists");
  });
});
