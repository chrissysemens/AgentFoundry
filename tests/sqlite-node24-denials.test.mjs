import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";
import { Script } from "node:vm";

// Static extraction of the root-only probe classifier: this is NOT a
// substitute for disposable cross-UID Linux deployment testing.
const probe = readFileSync(
  resolve("scripts/verify-sqlite-uid-isolation.mjs"),
  "utf8",
);
const start = probe.indexOf("function denied(name, action) {");
const end = probe.indexOf('\ndenied("direct SQL insert"', start);
assert.ok(start >= 0 && end > start, "Probe denial classifier not found");
const classifier = probe.slice(start, end);
const compiled = new Script(classifier + "\ndenied(name, action);");

function outcome(name, error) {
  const outcomes = [];
  const action = () => {
    throw error;
  };
  compiled.runInNewContext({ name, action, outcomes });
  return outcomes[0];
}

test("Node 24 SQLite denial errcodes are narrowly classified", () => {
  for (const errcode of [14, 8]) {
    assert.match(
      outcome("direct SQL insert", { code: "ERR_SQLITE_ERROR", errcode }),
      /: denied /,
    );
    assert.match(
      outcome("database write descriptor", {
        code: "ERR_SQLITE_ERROR",
        errcode,
      }),
      /INCONCLUSIVE/,
    );
  }
  for (const errcode of [1, 5, 19, 26, undefined]) {
    assert.match(
      outcome("direct SQL insert", { code: "ERR_SQLITE_ERROR", errcode }),
      /INCONCLUSIVE/,
    );
  }
});
