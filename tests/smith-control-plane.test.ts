import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  evaluateSmithCapability,
  type SmithCapability,
} from "../lib/smith/capabilities.ts";
import {
  createSmithEvent,
  detectOperationalAnomaly,
} from "../lib/smith/events.ts";
import { retryDelayMs, validateSmithJob } from "../lib/smith/jobs.ts";
import { redactOperationalData } from "../lib/smith/redaction.ts";
import { evidenceMatchesSha, isExactGitSha } from "../lib/smith/sha.ts";
import { canTransitionWorkItem } from "../lib/smith/state-machine.ts";

const migration = readFileSync(
  "supabase/migrations/20260912143011_smith_control_plane.sql",
  "utf8",
);

test("work item lifecycle accepts only explicit transitions", () => {
  assert.equal(canTransitionWorkItem("detected", "investigating"), true);
  assert.equal(canTransitionWorkItem("testing", "preview_ready"), true);
  assert.equal(canTransitionWorkItem("preview_ready", "deploying"), false);
  assert.equal(canTransitionWorkItem("deployed", "approved"), false);
});

test("Smith always denies Production mutation capabilities", () => {
  const forbidden: SmithCapability[] = [
    "deploy_production",
    "write_production_database",
    "modify_production_secrets",
    "modify_branch_protection",
    "approve_own_change",
    "rollback_production",
  ];
  for (const capability of forbidden) {
    const result = evaluateSmithCapability(capability, {
      environment: "test",
      killSwitchActive: false,
      githubConnected: true,
      testEnvironmentConnected: true,
      previewConnected: true,
    });
    assert.equal(result.allowed, false, capability);
  }
});

test("kill switch preserves reads and denies autonomous mutations", () => {
  const context = {
    environment: "local" as const,
    killSwitchActive: true,
    githubConnected: true,
    testEnvironmentConnected: true,
    previewConnected: true,
  };
  assert.equal(
    evaluateSmithCapability("read_system_events", context).allowed,
    true,
  );
  assert.equal(
    evaluateSmithCapability("create_branch", context).allowed,
    false,
  );
  assert.equal(evaluateSmithCapability("run_tests", context).allowed, false);
});

test("redaction runs before events become Smith context", () => {
  const redacted = redactOperationalData({
    authorization: "Bearer secret-token",
    nested: {
      password: "secret",
      safe: "postgresql://localhost/example",
    },
  }) as Record<string, unknown>;
  assert.equal(redacted.authorization, "[REDACTED]");
  assert.deepEqual(redacted.nested, {
    password: "[REDACTED]",
    safe: "[REDACTED]",
  });

  const event = createSmithEvent({
    eventName: "api.error",
    userId: null,
    sessionId: null,
    environment: "local",
    source: "test",
    metadata: { token: "must-not-survive" },
  });
  assert.equal(event.metadata.token, "[REDACTED]");
});

test("deterministic anomaly detection never invents a metric", () => {
  const base = Date.parse("2026-09-12T12:00:00.000Z");
  const events = [0, 1, 2].map((offset) =>
    createSmithEvent({
      eventName: "api.error",
      userId: null,
      sessionId: null,
      environment: "local",
      source: "test",
      timestamp: new Date(base + offset * 1_000).toISOString(),
    }),
  );
  const detection = detectOperationalAnomaly(events);
  assert.equal(detection?.severity, "error");
  assert.deepEqual(detection?.evidence, {
    eventNames: { "api.error": 3 },
    windowMinutes: 5,
  });
});

test("SHA evidence must match an exact full commit", () => {
  const sha = "a".repeat(40);
  assert.equal(isExactGitSha(sha), true);
  assert.equal(isExactGitSha("a".repeat(7)), false);
  assert.equal(evidenceMatchesSha(sha, sha), true);
  assert.equal(evidenceMatchesSha(sha, "b".repeat(40)), false);
});

test("jobs validate idempotency and bounded retry", () => {
  const job = validateSmithJob({
    jobType: "tests.run",
    idempotencyKey: "work-item:1:sha:abc",
  });
  assert.equal(job.max_attempts, 3);
  assert.equal(retryDelayMs(1), 5_000);
  assert.equal(retryDelayMs(20), 15 * 60_000);
  assert.throws(() =>
    validateSmithJob({ jobType: "bad job", idempotencyKey: "" }),
  );
});

test("control-plane migration denies regular and test users", () => {
  const expectedTables = [
    "smith_work_items",
    "smith_observations",
    "smith_previews",
    "smith_test_runs",
    "smith_test_results",
    "smith_approvals",
    "smith_audit_log",
    "smith_chat_threads",
    "smith_chat_messages",
    "smith_jobs",
    "smith_settings",
    "smith_production_authorizations",
  ];
  for (const table of expectedTables) {
    assert.match(
      migration,
      new RegExp(`create table smith_control\\.${table}`),
    );
  }
  assert.match(
    migration,
    /revoke all on schema smith_control\s+from public, anon, authenticated, smith_test/i,
  );
  assert.match(migration, /force row level security/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /expires_at <= created_at \+ interval '5 minutes'/i);
});
