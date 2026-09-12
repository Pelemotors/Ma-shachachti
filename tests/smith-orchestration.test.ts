import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chooseSmithNextAction } from "../lib/smith/orchestrator.ts";
import { SMITH_SYSTEM_PROMPT } from "../lib/smith/prompt.ts";

const connectedContext = {
  environment: "preview" as const,
  killSwitchActive: false,
  githubConnected: true,
  testEnvironmentConnected: true,
  previewConnected: true,
};

test("orchestrator follows investigate-build-test-preview-approval order", () => {
  assert.equal(
    chooseSmithNextAction({
      status: "detected",
      iteration: 0,
      hasDiagnosis: false,
      exactSha: null,
      testsPassed: false,
      previewReady: false,
      context: connectedContext,
    }).action,
    "investigate",
  );
  assert.equal(
    chooseSmithNextAction({
      status: "building",
      iteration: 1,
      hasDiagnosis: true,
      exactSha: "a".repeat(40),
      testsPassed: false,
      previewReady: false,
      context: connectedContext,
    }).action,
    "run_tests",
  );
  assert.equal(
    chooseSmithNextAction({
      status: "preview_ready",
      iteration: 2,
      hasDiagnosis: true,
      exactSha: "a".repeat(40),
      testsPassed: true,
      previewReady: true,
      context: connectedContext,
    }).action,
    "request_admin_approval",
  );
});

test("orchestrator stops at iteration and external approval boundaries", () => {
  assert.equal(
    chooseSmithNextAction({
      status: "building",
      iteration: 3,
      hasDiagnosis: true,
      exactSha: null,
      testsPassed: false,
      previewReady: false,
      context: connectedContext,
    }).action,
    "stop",
  );
  assert.equal(
    chooseSmithNextAction({
      status: "approval_requested",
      iteration: 1,
      hasDiagnosis: true,
      exactSha: "a".repeat(40),
      testsPassed: true,
      previewReady: true,
      context: connectedContext,
    }).action,
    "wait_for_admin",
  );
});

test("Smith prompt explicitly forbids invented evidence and Production", () => {
  assert.match(SMITH_SYSTEM_PROMPT, /לעולם אינך משנה Production/);
  assert.match(SMITH_SYSTEM_PROMPT, /אל תמציא data, tests, deployments/);
  assert.match(SMITH_SYSTEM_PROMPT, /evidence של ה-SHA המדויק/);
});

test("persistent chat and feedback APIs are Admin-only and disconnected", () => {
  const chat = readFileSync("app/api/admin/smith/chat/route.ts", "utf8");
  const feedback = readFileSync(
    "app/api/admin/smith/feedback/route.ts",
    "utf8",
  );
  assert.match(chat, /authorizeAdmin\(req\)/);
  assert.match(chat, /client_message_id/);
  assert.match(chat, /Smith Runner עדיין לא חובר/);
  assert.doesNotMatch(chat, /smith_jobs"\)\s*\.insert/);
  assert.match(feedback, /authorizeAdmin\(req\)/);
  assert.match(feedback, /automatic: false/);
});

test("feedback migration preserves the Smith schema boundary", () => {
  const migration = readFileSync(
    "supabase/migrations/20260912150843_smith_orchestration_feedback.sql",
    "utf8",
  );
  assert.match(migration, /create table smith_control\.smith_feedback/);
  assert.match(
    migration,
    /revoke all on smith_control\.smith_feedback\s+from public, anon, authenticated, smith_test/i,
  );
  assert.match(migration, /force row level security/i);
});
