import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  DEFAULT_REMINDER_MINUTES,
  formatTaskReminder,
  isReminderMinuteOption,
} from "../lib/reminders.ts";
import {
  canPromptPushPermission,
  notificationUiState,
  PUSH_PERMISSION_TRIGGER,
  reminderPatchFromSelect,
  reminderSelectValue,
  shouldAutoRequestPushPermission,
} from "../lib/push-client.ts";
import { PushSubscriptionInput } from "../lib/push.ts";
import {
  goneSubscriptionStatus,
  planTaskReminder,
  type ReminderTask,
} from "../lib/reminder-plan.ts";

const dueAt = "2026-09-10T18:00:00.000Z";
const nowDue = new Date("2026-09-10T17:31:00.000Z");

function task(partial: Partial<ReminderTask> = {}): ReminderTask {
  return {
    id: "task-1",
    user_id: "user-a",
    title: "להזמין אוכל לדגים",
    status: "open",
    reminder_at: null,
    due_at: dueAt,
    planned_start_at: null,
    reminder_enabled: true,
    reminder_offset_minutes: null,
    reminder_sent_at: null,
    reminder_claimed_at: null,
    ...partial,
  };
}

test("default preference starts at 30 minutes", () => {
  assert.equal(DEFAULT_REMINDER_MINUTES, 30);
  assert.equal(isReminderMinuteOption(30), true);
  assert.equal(isReminderMinuteOption(12), false);
});

test("push permission states map to honest UI copy states", () => {
  assert.equal(
    notificationUiState({
      supported: false,
      permission: "unsupported",
      hasSubscription: false,
      deliveryReady: false,
    }),
    "unsupported",
  );
  assert.equal(
    notificationUiState({
      supported: true,
      permission: "default",
      hasSubscription: false,
      deliveryReady: true,
    }),
    "permission-required",
  );
  assert.equal(
    notificationUiState({
      supported: true,
      permission: "granted",
      hasSubscription: true,
      deliveryReady: true,
    }),
    "active",
  );
  assert.equal(
    notificationUiState({
      supported: true,
      permission: "granted",
      hasSubscription: false,
      deliveryReady: true,
    }),
    "granted-unsubscribed",
  );
  assert.equal(
    notificationUiState({
      supported: true,
      permission: "denied",
      hasSubscription: false,
      deliveryReady: true,
    }),
    "permission-denied",
  );
  assert.equal(
    notificationUiState({
      supported: true,
      permission: "granted",
      hasSubscription: true,
      deliveryReady: false,
    }),
    "subscribed-not-ready",
  );
});

test("push permission is requested only from the settings button", () => {
  assert.equal(shouldAutoRequestPushPermission(), false);
  assert.equal(PUSH_PERMISSION_TRIGGER, "settings-button");
  assert.equal(canPromptPushPermission("permission-required"), true);
  assert.equal(canPromptPushPermission("permission-denied"), false);
});

test("push subscription payload cannot carry another user_id", () => {
  const parsed = PushSubscriptionInput.safeParse({
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: {
      p256dh: "abcdefghijklmnopqrstuvwxyz123456",
      auth: "abcdefghijklmnop",
    },
    user_id: "someone-else",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal("user_id" in parsed.data, false);
  }
});

test("future reminder is not sent early", () => {
  assert.equal(
    planTaskReminder(task(), 30, new Date("2026-09-10T17:20:00.000Z")).kind,
    "wait",
  );
});

test("due reminder is sent inside the grace window", () => {
  assert.equal(planTaskReminder(task(), 30, nowDue).kind, "send");
});

test("date-only and no-date tasks are not sent", () => {
  assert.equal(
    planTaskReminder(task({ due_at: null }), 30, nowDue).kind,
    "skip",
  );
});

test("done and cancelled tasks are not sent", () => {
  assert.equal(
    planTaskReminder(task({ status: "done" }), 30, nowDue).kind,
    "skip",
  );
  assert.equal(
    planTaskReminder(task({ status: "cancelled" }), 30, nowDue).kind,
    "skip",
  );
});

test("reminder_enabled=false disables notification", () => {
  assert.equal(
    planTaskReminder(task({ reminder_enabled: false }), 30, nowDue).kind,
    "skip",
  );
});

test("per-task override is respected and default is inherited", () => {
  const override = planTaskReminder(
    task({ reminder_offset_minutes: 60 }),
    30,
    new Date("2026-09-10T17:01:00.000Z"),
  );
  assert.equal(override.kind, "send");
  if (override.kind === "send") assert.equal(override.offset, 60);
  const inherited = planTaskReminder(
    task({ reminder_offset_minutes: null }),
    180,
    new Date("2026-09-10T15:01:00.000Z"),
  );
  assert.equal(inherited.kind, "send");
  if (inherited.kind === "send") assert.equal(inherited.offset, 180);
});

test("planner uses explicit reminder_at before due and planned bases", () => {
  const explicit = planTaskReminder(
    task({
      reminder_at: "2026-09-10T17:00:00.000Z",
      due_at: "2026-09-10T20:00:00.000Z",
      planned_start_at: "2026-09-10T19:00:00.000Z",
      reminder_offset_minutes: 0,
    }),
    30,
    new Date("2026-09-10T17:01:00.000Z"),
  );
  assert.equal(explicit.kind, "send");

  const planned = planTaskReminder(
    task({
      reminder_at: null,
      due_at: null,
      planned_start_at: "2026-09-10T18:00:00.000Z",
    }),
    30,
    new Date("2026-09-10T17:31:00.000Z"),
  );
  assert.equal(planned.kind, "send");
});

test("expired 404/410 subscriptions are treated as gone", () => {
  assert.equal(goneSubscriptionStatus(404), true);
  assert.equal(goneSubscriptionStatus(410), true);
  assert.equal(goneSubscriptionStatus(500), false);
});

test("task reminder select can disable or inherit", () => {
  assert.equal(
    reminderSelectValue({
      reminder_enabled: true,
      reminder_offset_minutes: null,
    }),
    "default",
  );
  assert.deepEqual(reminderPatchFromSelect("off"), {
    reminder_patch: "set",
    reminder_enabled: false,
    reminder_offset_minutes: null,
  });
  assert.equal(
    formatTaskReminder({
      due_at: dueAt,
      reminder_enabled: false,
      reminder_offset_minutes: 30,
      default_reminder_minutes: 30,
    }),
    "ללא התראה",
  );
});

test("notification tables stay isolated by auth.uid and not user_metadata", () => {
  const sql = readFileSync(
    new URL("../database/migrations/20260910_lean_notifications.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /auth\.uid\(\)\) = user_id/);
  assert.doesNotMatch(sql, /user_metadata/);
  assert.match(sql, /notification_preferences_select_own/);
  assert.match(sql, /user_push_subscriptions_delete_own/);
  assert.match(sql, /enable row level security/);
});

test("pending foundation migration makes reminders conservative and leaves legacy tables alone", () => {
  const sql = readFileSync(
    new URL(
      "../database/migrations/20260912_lean_agent_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /add column if not exists reminder_at timestamptz/);
  assert.match(sql, /alter column reminder_enabled set default false/);
  assert.match(sql, /reminder_opted_in_at is null/);
  assert.match(
    sql,
    /p_action ->> 'reminder_patch' = 'set'[\s\S]*reminder_enabled/,
  );
  assert.match(sql, /coalesce\(reminder_at, due_at, planned_start_at\)/);
  assert.doesNotMatch(sql, /legacy_push|push_subscriptions_legacy/);
});

test("service worker registration has one shared owner and valid local assets", () => {
  const owner = readFileSync(
    new URL("../lib/push-service-worker.ts", import.meta.url),
    "utf8",
  );
  const app = readFileSync(
    new URL("../components/chat-app.tsx", import.meta.url),
    "utf8",
  );
  const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  const icon = readFileSync(
    new URL("../public/icon.svg", import.meta.url),
    "utf8",
  );
  assert.match(owner, /registrationPromise \?\?=/);
  assert.doesNotMatch(app, /serviceWorker\.register/);
  assert.match(worker, /showNotification/);
  assert.match(worker, /clients\.openWindow/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(icon, /<svg/);
});
