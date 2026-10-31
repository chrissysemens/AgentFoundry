import { digest } from "../src/domain.ts";
import type { ApprovalEvidenceVerifier } from "../src/domain.ts";
import type { SipApprovalReceipt } from "../src/sip-approval.ts";

/** Synthetic test-only evidence; never use as a production approval provider. */
export const fixtureContent = "approved SIP";
export const fixtureGitSha = "a".repeat(40);
export const fixtureHuman = {
  approver_id: "fixture-human-1",
  source: "fixture-only",
  source_event_id: "fixture-approval-1",
  approved_at: "2020-01-01T00:00:00.000Z",
};
export const fixtureReceipt: SipApprovalReceipt = {
  sip_revision: "2",
  sip_sha256: digest(fixtureContent),
  sip_git_sha: fixtureGitSha,
  ...fixtureHuman,
};
export const fixtureVerifier: ApprovalEvidenceVerifier = (receipt) =>
  receipt.source_event_id === fixtureHuman.source_event_id
    ? {
        sip: {
          revision: "2",
          git_sha: fixtureGitSha,
          utf8_content: fixtureContent,
        },
        human: fixtureHuman,
      }
    : undefined;
