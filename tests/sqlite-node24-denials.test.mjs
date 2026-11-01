import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

// Regression checks for the root-only deployment script. Real UID isolation
// must still be tested on disposable Linux infrastructure.
const probe = readFileSync(
  resolve("scripts/verify-sqlite-uid-isolation.mjs"),
  "utf8",
);
const start = probe.indexOf("function denied(name, action) {");
const end = probe.indexOf("\ndenied(\"direct SQL insert\"", start);
assert.ok(start >= 0 && end > start, "Probe denial classifier not found");
const classifier = probe.slice(start, end);

test("Node 24 SQLite errno 14 and 8 are accepted only for SQL insertion", () => {
  const outcome = (name, error) => {
    const outcomes = [];
    const action = () => {
      throw error;
    };
    const denied = new Function(
      "name",
      "action",
      "outcomes",
      classifier + "\nreturn denied(name, action);",
    );
    denied(name, action, outcomes);
    return outcomes[0];
  };
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
