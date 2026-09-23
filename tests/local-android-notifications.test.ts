import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  localNotificationId,
  planLocalReminderSync,
  shouldScheduleLocalReminder,
} from "../apps/mobile/src/notifications/localReminders.ts";

type MobileTask = {
  id: string;
  title: string;
  status: "open" | "done" | "cancelled";
  due_on: string | null;
  due_at: string | null;
  reminder_enabled?: boolean;
  reminder_at?: string | null;
};

const root = new URL("../", import.meta.url);

function read(rel: string) {
  return readFileSync(new URL(rel, root), "utf8");
}

function task(partial: Partial<MobileTask> = {}): MobileTask {
  return {
    id: "abc-1",
    title: "תזכורת בדיקה",
    status: "open",
    due_on: null,
    due_at: null,
    reminder_enabled: true,
    reminder_at: "2026-09-23T10:05:00.000Z",
    ...partial,
  };
}

const now = Date.parse("2026-09-23T10:00:00.000Z");

test("privacy copy and stable local identifier", () => {
  const src = read("apps/mobile/src/notifications/localReminders.ts");
  assert.match(src, /מה שכחתי\?/);
  assert.match(src, /יש לך תזכורת ממתינה/);
  assert.equal(localNotificationId("abc-1"), "task:abc-1");
});

test("only future open reminders are scheduled", () => {
  assert.equal(shouldScheduleLocalReminder(task(), now), true);
  assert.equal(shouldScheduleLocalReminder(task({ status: "done" }), now), false);
  assert.equal(
    shouldScheduleLocalReminder(task({ status: "cancelled" }), now),
    false,
  );
  assert.equal(
    shouldScheduleLocalReminder(task({ reminder_enabled: false }), now),
    false,
  );
  assert.equal(
    shouldScheduleLocalReminder(
      task({ reminder_at: "2026-09-23T09:59:00.000Z" }),
      now,
    ),
    false,
  );
});

test("time change cancels then reschedules the same id once", () => {
  const later = task({ reminder_at: "2026-09-23T10:08:00.000Z" });
  const plan = planLocalReminderSync(
    [later],
    [{ identifier: "task:abc-1", triggerMs: Date.parse("2026-09-23T10:05:00.000Z") }],
    now,
  );
  assert.deepEqual(plan.cancel, ["task:abc-1"]);
  assert.equal(plan.schedule.length, 1);
  assert.equal(plan.schedule[0]?.id, "task:abc-1");
  assert.equal(plan.skip.length, 0);
});

test("same identifier and same time is not duplicated", () => {
  const plan = planLocalReminderSync(
    [task()],
    [{ identifier: "task:abc-1", triggerMs: Date.parse("2026-09-23T10:05:00.000Z") }],
    now,
  );
  assert.deepEqual(plan.skip, ["task:abc-1"]);
  assert.deepEqual(plan.schedule, []);
  assert.deepEqual(plan.cancel, []);
});

test("completed cancelled or missing tasks cancel their local notification", () => {
  const existing = [{ identifier: "task:abc-1", triggerMs: Date.parse("2026-09-23T10:05:00.000Z") }];
  assert.deepEqual(planLocalReminderSync([task({ status: "done" })], existing, now).cancel, [
    "task:abc-1",
  ]);
  assert.deepEqual(
    planLocalReminderSync([task({ status: "cancelled" })], existing, now).cancel,
    ["task:abc-1"],
  );
  assert.deepEqual(planLocalReminderSync([], existing, now).cancel, ["task:abc-1"]);
});

test("mobile persist path and settings permission wiring stay local-only", () => {
  const tasks = read("apps/mobile/src/api/tasks.ts");
  const settings = read("apps/mobile/src/screens/NotificationSettingsScreen.tsx");
  const config = read("apps/mobile/app.config.ts");
  const auth = read("apps/mobile/src/auth/AuthContext.tsx");
  const local = read("apps/mobile/src/notifications/localReminders.ts");
  assert.match(tasks, /syncLocalReminders/);
  assert.match(tasks, /persistAndSync/);
  assert.match(tasks, /task\.complete/);
  assert.match(tasks, /task\.delete/);
  assert.match(tasks, /setTaskReminder/);
  assert.match(settings, /getPermissionsAsync/);
  assert.match(settings, /requestPermissionsAsync/);
  assert.match(settings, /openAppNotificationSettings/);
  assert.match(settings, /נחסם בהגדרות המכשיר/);
  assert.match(config, /POST_NOTIFICATIONS/);
  assert.match(auth, /ensureLocalNotificationRuntime/);
  assert.doesNotMatch(local, /firebase|FCM|google-services|getDevicePushTokenAsync/i);
});
