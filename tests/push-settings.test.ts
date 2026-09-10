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
    due_at: dueAt,
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
    }),
    "unsupported",
  );
  assert.equal(
    notificationUiState({
      supported: true,
      permission: "default",
      hasSubscription: false,
    }),
    "default",
  );
  assert.equal(
    notificationUiState({
      supported: true,
      permission: "granted",
      hasSubscription: true,
    }),
    "granted",
  );
  assert.equal(
    notificationUiState({
      supported: true,
      permission: "granted",
      hasSubscription: false,
    }),
    "granted-unsubscribed",
  );
  assert.equal(
    notificationUiState({
      supported: true,
      permission: "denied",
      hasSubscription: false,
    }),
    "denied",
  );
});

test("push permission is requested only from the settings button", () => {
  assert.equal(shouldAutoRequestPushPermission(), false);
  assert.equal(PUSH_PERMISSION_TRIGGER, "settings-button");
  assert.equal(canPromptPushPermission("default"), true);
  assert.equal(canPromptPushPermission("denied"), false);
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
