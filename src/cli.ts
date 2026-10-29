import type { ApprovalEvidenceVerifier } from "./domain.ts";
import { SQLiteJournal } from "./journal.ts";
import { digest } from "./domain.ts";
import type { Review } from "./domain.ts";

const args = process.argv.slice(2);

if (args.includes("--help") || args.length === 0) {
  console.log(
    "Foundry CLI\n  npm run cli -- demo [database.sqlite]\n  npm run cli -- --help",
  );
  process.exit(0);
}

if (args[0] !== "demo") {
  console.error("Unknown command");
  process.exit(1);
}

// Demonstration-only simulated approval source. NOT authenticated production evidence.
const demoHuman = {
  approver_id: "demo-human",
  source: "demo-fixture",
  source_event_id: "demo-event",
  approved_at: "2020-01-01T00:00:00.000Z",
};
const demoGitSha = "a".repeat(40);
const verifyDemoApproval: ApprovalEvidenceVerifier = (receipt) =>
  receipt.source_event_id === demoHuman.source_event_id
    ? {
        sip: {
          revision: "1",
          git_sha: demoGitSha,
          utf8_content: "SIP demo revision 1",
        },
        human: demoHuman,
      }
    : undefined;
const journal = new SQLiteJournal(args[1] ?? ":memory:", verifyDemoApproval);
const id = "FOUND-DEMO";

const append = (
  type: string,
  actor: string,
  payload: Record<string, unknown> = {},
) => {
  const s = journal.append(id, type, actor, payload);
  console.log(`${type}: ${s.status} (repairs ${s.repair_count})`);

  return s;
};

const sha = digest("SIP demo revision 1");

append("TICKET_CREATED", "human:owner", { title: "Demo" });
append("GRILL_STARTED", "human:owner");
append("SIP_PROPOSED", "agent:planner", { revision: "1", sha256: sha });
append("SIP_APPROVED", "human:owner", {
  revision: "1",
  sha256: sha,
  receipt: {
    sip_revision: "1",
    sip_sha256: sha,
    sip_git_sha: demoGitSha,
    ...demoHuman,
  },
});
append("IMPLEMENTATION_STARTED", "agent:developer", {
  revision: "1",
  sha256: sha,
  implementation_id: "impl-demo",
});
append("CODE_SUBMITTED", "agent:developer", {
  implementation_id: "impl-demo",
  code_revision: "sha-code-1",
});

const review: Review = {
  schema_version: "1",
  review_id: "review-demo",
  implementation_id: "impl-demo",
  sip_revision: "1",
  sip_sha256: sha,
  code_revision: "sha-code-1",
  reviewer: "oracle:isolated",
  scope: "INITIAL_FULL",
  verdict: "ACCEPT",
  timestamp: new Date().toISOString(),
  findings: [],
  automated_check_refs: ["npm-run-verify:local"],
  checks_passed: true,
};

append("ORACLE_REVIEWED", "oracle:isolated", { review });

console.log(
  "Oracle accepted; merge still requires a separate human authorization.",
);

journal.close();
