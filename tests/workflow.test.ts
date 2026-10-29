import { fixtureReceipt, fixtureVerifier } from "./approval-fixture.ts";
import { describe, expect, it } from "vitest";

import { digest, FakeOracle, reduceEvents } from "../src/domain.ts";
import type { OracleRequest, Review } from "../src/domain.ts";
import { MemoryJournal, SQLiteJournal } from "../src/journal.ts";
import type { Journal } from "../src/journal.ts";

function setup(journal: Journal) {
  const ticketId = "FOUND-002";
  const sipHash = digest("approved SIP");

  const append = (
    type: string,
    actor = "agent:dev",
    payload: Record<string, unknown> = {},
  ) => journal.append(ticketId, type, actor, payload);

  append("TICKET_CREATED", "human:owner", { title: "Oracle" });
  append("GRILL_STARTED");
  append("SIP_PROPOSED", "agent:planner", { revision: "2", sha256: sipHash });
  append("SIP_APPROVED", "human:owner", { revision: "2", sha256: sipHash, receipt: fixtureReceipt });
  append("IMPLEMENTATION_STARTED", "agent:dev", {
    revision: "2",
    sha256: sipHash,
    implementation_id: "stable-impl",
  });
  append("CODE_SUBMITTED", "agent:dev", {
    implementation_id: "stable-impl",
    code_revision: "code0",
  });

  return { ticketId, sipHash, append };
}

function review(
  sipHash: string,
  codeRevision: string,
  attempt: number,
  verdict: Review["verdict"] = "REJECT",
): Review {
  return {
    schema_version: "1",
    review_id: `review-${codeRevision}`,
    implementation_id: "stable-impl",
    sip_revision: "2",
    sip_sha256: sipHash,
    code_revision: codeRevision,
    reviewer: "oracle:independent",
    scope: attempt === 0 ? "INITIAL_FULL" : "INCREMENTAL",
    verdict,
    timestamp: new Date().toISOString(),
    automated_check_refs: ["npm-run-verify:fixture"],
    checks_passed: verdict === "ACCEPT",
    findings:
      verdict === "REJECT"
        ? [
            {
              id: "F1",
              category: "standard",
              severity: "high",
              location: "src/audio.cpp:12",
              evidence: "Allocation on audio thread",
              resolution: "No allocation on processBlock",
              rule_ref: "RT-001",
            },
          ]
        : [],
    ...(attempt > 0
      ? {
          changed_files: ["src/audio.cpp"],
          outstanding_findings: ["F1"],
          affected_paths: ["audio"],
          regression_checks: ["unit:passed"],
        }
      : {}),
    ...(verdict === "INCONCLUSIVE"
      ? { escalation_reason: "Provider unavailable" }
      : {}),
  };
}

const adapters = [
  { name: "memory", create: () => new MemoryJournal(fixtureVerifier) },
  { name: "sqlite", create: () => new SQLiteJournal(":memory:", fixtureVerifier) },
];

for (const adapter of adapters) {
  describe(adapter.name, () => {
    it("requires approval and the exact SIP identity", () => {
      const journal = adapter.create();
      journal.append("x", "TICKET_CREATED", "human:owner", { title: "x" });
      expect(() =>
        journal.append("x", "IMPLEMENTATION_STARTED", "agent:dev", {
          revision: "2",
          sha256: "x",
          implementation_id: "impl",
        }),
      ).toThrow();
    });

    it("allows three repairs, escalates, and rejects a fourth", () => {
      const journal = adapter.create();
      const { ticketId, sipHash, append } = setup(journal);
      append("ORACLE_REVIEWED", "oracle:independent", {
        review: review(sipHash, "code0", 0),
      });
      for (let attempt = 1; attempt <= 3; attempt++) {
        append("REPAIR_STARTED", "agent:dev", {
          implementation_id: "stable-impl",
        });
        append("REPAIR_SUBMITTED", "agent:dev", {
          implementation_id: "stable-impl",
          code_revision: `code${attempt}`,
        });
        append("ORACLE_REVIEWED", "oracle:independent", {
          review: review(sipHash, `code${attempt}`, attempt),
        });
      }
      const events = journal.read(ticketId);
      const state = reduceEvents(ticketId, events, fixtureVerifier);
      expect(events).toHaveLength(16);
      expect(state.status).toBe("ESCALATED");
      expect(state.repair_count).toBe(3);
      expect(() =>
        append("REPAIR_STARTED", "agent:dev", {
          implementation_id: "stable-impl",
        }),
      ).toThrow();
    });

    it("escalates inconclusive review without using repair budget", () => {
      const journal = adapter.create();
      const { ticketId, sipHash, append } = setup(journal);
      append("ORACLE_REVIEWED", "oracle:independent", {
        review: review(sipHash, "code0", 0, "INCONCLUSIVE"),
      });
      const state = reduceEvents(ticketId, journal.read(ticketId), fixtureVerifier);
      expect(state.repair_count).toBe(0);
      expect(state.status).toBe("ESCALATED");
    });

    it("rejects advisory-only or unevidenced blocking findings", () => {
      const journal = adapter.create();
      const { sipHash, append } = setup(journal);
      const result = review(sipHash, "code0", 0);
      result.findings = [
        {
          id: "a",
          category: "advisory",
          severity: "low",
          location: "README:1",
          evidence: "Naming",
          resolution: "Rename",
        },
      ];
      expect(() =>
        append("ORACLE_REVIEWED", "oracle:independent", {
          review: result,
        }),
      ).toThrow();
      result.findings = [
        {
          id: "a",
          category: "standard",
          severity: "high",
          location: "x",
          evidence: "",
          resolution: "Fix",
          rule_ref: "S-1",
        },
      ];
      expect(() =>
        append("ORACLE_REVIEWED", "oracle:independent", {
          review: result,
        }),
      ).toThrow();
    });

    it("requires human merge approval for the exact accepted revision", () => {
      const journal = adapter.create();
      const { ticketId, sipHash, append } = setup(journal);
      append("ORACLE_REVIEWED", "oracle:independent", {
        review: review(sipHash, "code0", 0, "ACCEPT"),
      });
      const payload = {
        implementation_id: "stable-impl",
        code_revision: "code0",
        review_id: "review-code0",
      };
      expect(() =>
        append("MERGE_AUTHORIZED", "oracle:independent", payload),
      ).toThrow();
      expect(() =>
        append("MERGE_AUTHORIZED", "human:owner", {
          ...payload,
          code_revision: "stale",
        }),
      ).toThrow();
      append("MERGE_AUTHORIZED", "human:owner", payload);
      expect(reduceEvents(ticketId, journal.read(ticketId), fixtureVerifier).status).toBe(
        "MERGE_AUTHORIZED",
      );
    });

    it("keeps advisory proposals inert until human approval", () => {
      const journal = adapter.create();
      const { ticketId, append } = setup(journal);
      append("ADVISORY_PROPOSED", "oracle:independent", {
        fingerprint: "abc",
        description: "Improve naming",
      });
      expect(() =>
        append("ADVISORY_PROPOSED", "oracle:independent", {
          fingerprint: "abc",
          description: "Duplicate",
        }),
      ).toThrow();
      expect(
        reduceEvents(ticketId, journal.read(ticketId), fixtureVerifier).proposals.abc?.status,
      ).toBe("PROPOSED");
      append("ADVISORY_APPROVED", "human:owner", { fingerprint: "abc" });
      expect(
        reduceEvents(ticketId, journal.read(ticketId), fixtureVerifier).proposals.abc?.status,
      ).toBe("APPROVED_FOR_BACKLOG");
    });

    it("rejects stale reviews and requires incremental regression evidence", () => {
      const journal = adapter.create();
      const { sipHash, append } = setup(journal);
      expect(() =>
        append("ORACLE_REVIEWED", "oracle:independent", {
          review: review(sipHash, "wrong", 0),
        }),
      ).toThrow();
      append("ORACLE_REVIEWED", "oracle:independent", {
        review: review(sipHash, "code0", 0),
      });
      append("REPAIR_STARTED", "agent:dev", {
        implementation_id: "stable-impl",
      });
      append("REPAIR_SUBMITTED", "agent:dev", {
        implementation_id: "stable-impl",
        code_revision: "code1",
      });
      const invalid = review(sipHash, "code1", 1);
      invalid.regression_checks = [];
      expect(() =>
        append("ORACLE_REVIEWED", "oracle:independent", {
          review: invalid,
        }),
      ).toThrow();
    });

    it("replays the same state from an event-history copy", () => {
      const journal = adapter.create();
      const { ticketId } = setup(journal);
      const events = journal.read(ticketId);
      expect(reduceEvents(ticketId, structuredClone(events), fixtureVerifier)).toEqual(
        reduceEvents(ticketId, events, fixtureVerifier),
      );
    });
  });
}

it("does not expose developer private reasoning through the Oracle request", async () => {
  const result = review(digest("approved SIP"), "code0", 0, "ACCEPT");
  const request: OracleRequest = {
    implementation_id: "stable-impl",
    sip_revision: "2",
    sip_sha256: result.sip_sha256,
    code_revision: "code0",
    diff: "diff",
    standards: [],
    checks: [],
    previous_findings: [],
  };
  expect((await new FakeOracle([result]).review(request)).verdict).toBe(
    "ACCEPT",
  );
});
