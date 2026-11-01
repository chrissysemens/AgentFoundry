import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchIssue,
  parseIssueUrl,
  summarizeIssue,
} from "../scripts/github-issue-intake.mjs";

const url = "https://github.com/example/project/issues/42";
const record = {
  number: 42,
  title: "Improve the settings screen",
  body: "Add an accessible layout.",
  repository_url: "https://api.github.com/repos/example/project",
  html_url: url,
};

test("accepts only a plain GitHub issue URL", () => {
  assert.deepEqual(parseIssueUrl(url), {
    owner: "example",
    repo: "project",
    number: 42,
  });
  for (const invalid of [
    "https://evil.example/issues/42",
    "http://github.com/example/project/issues/42",
    "https://github.com/example/project/pull/42",
    "https://github.com/example/project/issues/42?token=secret",
    "https://github.com@example.org/example/project/issues/42",
    "https://github.com/example/project/issues/0",
    "https://github.com/example/project/issues/99999999999999999999",
  ]) {
    assert.throws(() => parseIssueUrl(invalid));
  }
});

test("reads issue with GET and no write operations", async () => {
  let called = false;
  const issue = await fetchIssue(url, {
    fetchImpl: async (target, options) => {
      called = true;
      assert.equal(
        target,
        "https://api.github.com/repos/example/project/issues/42",
      );
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, undefined);
      return { ok: true, json: async () => record };
    },
  });
  assert.equal(called, true);
  assert.equal(issue.title, record.title);
  assert.match(summarizeIssue(issue), /Questions for the human/);
  assert.match(summarizeIssue(issue), /READ ONLY/);
});

test("rejects pull requests and mismatched repositories", async () => {
  for (const bad of [
    { ...record, pull_request: {} },
    { ...record, number: 43 },
    { ...record, repository_url: "https://api.github.com/repos/other/project" },
    { ...record, html_url: "https://github.com/other/project/issues/42" },
  ]) {
    await assert.rejects(
      fetchIssue(url, {
        fetchImpl: async () => ({ ok: true, json: async () => bad }),
      }),
      /unexpected issue record/,
    );
  }
});

test("handles unavailable, forbidden and invalid responses without leaking tokens", async () => {
  await assert.rejects(
    fetchIssue(url, {
      fetchImpl: async () => {
        throw new Error("secret-token");
      },
    }),
    /Could not reach GitHub/,
  );
  for (const status of [401, 403, 404, 500]) {
    await assert.rejects(
      fetchIssue(url, {
        token: "secret-token",
        fetchImpl: async () => ({ ok: false, status }),
      }),
      (error) => !error.message.includes("secret-token"),
    );
  }
  await assert.rejects(
    fetchIssue(url, {
      fetchImpl: async () => ({
        ok: true,
        json: async () => {
          throw new Error("secret-token");
        },
      }),
    }),
    /invalid JSON/,
  );
});
