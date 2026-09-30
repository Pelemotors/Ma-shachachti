import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyReminderAction, reminderStateAt } from "../lib/notification-lifecycle.ts";
import { notificationEntityFromPayload, routeForNotificationPayload } from "../lib/notification-deep-links.ts";
import { decodeAppRoute } from "../lib/app-route-state.ts";

const now = new Date("2026-09-30T12:00:00.000Z");
const active = { state: "active" as const, remind_at: "2026-10-01T12:00:00.000Z", handled_at: null, snoozed_until: null };

test("M12 reminder lifecycle never completes its linked task", () => {
  assert.equal(applyReminderAction(active, { kind: "handled" }, now).state, "handled");
  assert.equal(applyReminderAction(active, { kind: "cancel" }, now).state, "cancelled");
  assert.equal(applyReminderAction(active, { kind: "snooze", until: "2026-10-01T13:00:00.000Z" }, now).state, "snoozed");
  assert.equal(applyReminderAction(active, { kind: "change", until: "2026-10-02T13:00:00.000Z" }, now).remind_at, "2026-10-02T13:00:00.000Z");
  assert.equal(reminderStateAt({ ...active, remind_at: "2026-09-29T12:00:00.000Z" }, now), "missed");
});

test("M12 deep links resolve exact entities and reject missing entities", () => {
  for (const [payload, view, key] of [
    [{ taskId: "11111111-1111-4111-8111-111111111111" }, "tasks", "taskId"],
    [{ shoppingId: "22222222-2222-4222-8222-222222222222" }, "shopping", "shoppingId"],
    [{ checklistId: "33333333-3333-4333-8333-333333333333" }, "checklists", "checklistId"],
    [{ notificationId: "44444444-4444-4444-8444-444444444444" }, "notifications", "notificationId"],
  ] as const) {
    assert.deepEqual(notificationEntityFromPayload(payload)?.kind, view === "tasks" ? "task" : view === "shopping" ? "shopping" : view === "checklists" ? "checklist" : "notification");
    const route = routeForNotificationPayload(payload);
    assert.equal(decodeAppRoute(route?.split("?")[1] ?? "")[key as "taskId" | "shoppingId" | "checklistId" | "notificationId"], Object.values(payload)[0]);
  }
  assert.equal(routeForNotificationPayload({}), null);
});

test("M12 dispatch uses an exact task deep link and existing dedupe key", () => {
  const source = readFileSync(new URL("../lib/reminder-dispatch.ts", import.meta.url), "utf8");
  const record = readFileSync(new URL("../lib/notifications/record.ts", import.meta.url), "utf8");
  assert.match(source, /view=tasks&task=\$\{task\.id\}/);
  assert.match(record, /onConflict: "user_id,logical_key"/);
});

test("M12 action API is server-authenticated and does not complete tasks", () => {
  const route = readFileSync(new URL("../app/api/notifications/[id]/route.ts", import.meta.url), "utf8");
  assert.match(route, /authorize\(req\)/);
  assert.match(route, /handled|snooze|change|cancel/);
  assert.doesNotMatch(route, /completeTask|from\("tasks"\)/);
});
