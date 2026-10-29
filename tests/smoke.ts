import assert from "node:assert/strict";
import { Journal, MemoryJournal, SQLiteJournal } from "../src/journal.ts";
import { digest, reduceEvents, Review } from "../src/domain.ts";
const TICKET_ID = "FOUND-002";
const IMPLEMENTATION_ID = "impl";
const SIP_REVISION = "2";

let assertionCount = 0;

function createReview(
  sipHash: string,
  attempt: number,
  verdict: "ACCEPT" | "REJECT" = "REJECT",
): Review {
  return {
    schema_version: "1",
    review_id: `r${attempt}`,
    implementation_id: IMPLEMENTATION_ID,
    sip_revision: SIP_REVISION,
    sip_sha256: sipHash,
    code_revision: `code${attempt}`,
    reviewer: "oracle:isolated",
    scope: attempt === 0 ? "INITIAL_FULL" : "INCREMENTAL",
    verdict,
    timestamp: new Date().toISOString(),
    automated_check_refs: ["npm-run-verify:smoke"],
    checks_passed: verdict === "ACCEPT",

    findings:
      verdict === "REJECT"
        ? [
            {
              id: "f",
              category: "standard",
              severity: "high",
              location: "a:1",
              evidence: "test evidence",
              resolution: "fix",
              rule_ref: "RT-1",
            },
          ]
        : [],

    ...(attempt > 0
      ? {
          changed_files: ["a"],
          outstanding_findings: ["f"],
          affected_paths: ["a"],
          regression_checks: ["tests passed"],
        }
      : {}),
  };
}

function runSmokeTests(journal: Journal): void {
  const sipHash = digest("sip");

  const append = (
    eventType: string,
    actor = "agent:dev",
    payload: Record<string, unknown> = {},
  ) => {
    return journal.append(TICKET_ID, eventType, actor, payload);
  };

  // 1. Implementation requires SIP approval.
  append("TICKET_CREATED", "human:owner", {
    title: "Test",
  });

  assert.throws(() => {
    append("IMPLEMENTATION_STARTED", "agent:dev", {
      revision: SIP_REVISION,
      sha256: sipHash,
      implementation_id: IMPLEMENTATION_ID,
    });
  });

  assertionCount++;

  // 2. Complete the approval and initial submission workflow.
  append("GRILL_STARTED");

  append("SIP_PROPOSED", "agent:planner", {
    revision: SIP_REVISION,
    sha256: sipHash,
  });

  append("SIP_APPROVED", "human:owner", {
    revision: SIP_REVISION,
    sha256: sipHash,
  });

  append("IMPLEMENTATION_STARTED", "agent:dev", {
    revision: SIP_REVISION,
    sha256: sipHash,
    implementation_id: IMPLEMENTATION_ID,
  });

  append("CODE_SUBMITTED", "agent:dev", {
    implementation_id: IMPLEMENTATION_ID,
    code_revision: "code0",
  });

  // 3. The Oracle rejects the initial submission.
  append("ORACLE_REVIEWED", "oracle:isolated", {
    review: createReview(sipHash, 0),
  });

  // 4. Allow exactly three unsuccessful repair attempts.
  for (let attempt = 1; attempt <= 3; attempt++) {
    append("REPAIR_STARTED", "agent:dev", {
      implementation_id: IMPLEMENTATION_ID,
    });

    append("REPAIR_SUBMITTED", "agent:dev", {
      implementation_id: IMPLEMENTATION_ID,
      code_revision: `code${attempt}`,
    });

    append("ORACLE_REVIEWED", "oracle:isolated", {
      review: createReview(sipHash, attempt),
    });
  }

  const events = journal.read(TICKET_ID);
  const state = reduceEvents(TICKET_ID, events);

  assert.equal(state.repair_count, 3);
  assert.equal(state.status, "ESCALATED");

  assertionCount++;

  // 5. A fourth repair must be rejected.
  assert.throws(() => {
    append("REPAIR_STARTED", "agent:dev", {
      implementation_id: IMPLEMENTATION_ID,
    });
  });

  // 6. Replaying the event history must reproduce the same state.
  const replayedState = reduceEvents(TICKET_ID, structuredClone(events));

  assert.deepEqual(state, replayedState);

  assertionCount++;
}

const journalFactories = [
  {
    name: "Memory",
    create: () => new MemoryJournal(),
  },
  {
    name: "SQLite",
    create: () => new SQLiteJournal(":memory:"),
  },
];

for (const factory of journalFactories) {
  const journal = factory.create();

  try {
    runSmokeTests(journal);
    console.log(`${factory.name} smoke tests passed`);
  } finally {
    if (journal instanceof SQLiteJournal) {
      journal.close();
    }
  }
}

console.log(
  `${assertionCount} built-in smoke assertions passed across memory and SQLite adapters`,
);
