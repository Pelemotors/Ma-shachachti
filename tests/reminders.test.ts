import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_REMINDER_MINUTES,
  effectiveReminderOffset,
  reminderBase,
  reminderDispatchState,
  remindAtIso,
  shouldResetReminderDelivery,
} from "../lib/reminders.ts";
import { validPushEndpoint } from "../lib/push.ts";

const dueAt = "2026-09-10T18:00:00.000Z";

test("future reminder is not due yet", () => {
  const remindAt = remindAtIso(dueAt, 30);
  assert.equal(
    reminderDispatchState(new Date("2026-09-10T17:20:00.000Z"), remindAt),
    "future",
  );
});

test("due reminder is sent inside the grace window", () => {
  const remindAt = remindAtIso(dueAt, 30);
  assert.equal(remindAt, "2026-09-10T17:30:00.000Z");
  assert.equal(
    reminderDispatchState(new Date("2026-09-10T17:31:00.000Z"), remindAt),
    "due",
  );
});

test("date-only and no-date tasks have no reminder offset", () => {
  assert.equal(
    effectiveReminderOffset({
      due_at: null,
      reminder_enabled: true,
      reminder_offset_minutes: null,
      default_reminder_minutes: DEFAULT_REMINDER_MINUTES,
    }),
    null,
  );
});

test("done/cancelled/disabled tasks are not reminder candidates", () => {
  assert.equal(
    effectiveReminderOffset({
      due_at: dueAt,
      reminder_enabled: false,
      reminder_offset_minutes: 10,
      default_reminder_minutes: 30,
    }),
    null,
  );
});

test("per-task override wins over the user default", () => {
  assert.equal(
    effectiveReminderOffset({
      due_at: dueAt,
      reminder_enabled: true,
      reminder_offset_minutes: 60,
      default_reminder_minutes: 30,
    }),
    60,
  );
});

test("null override inherits the current default", () => {
  assert.equal(
    effectiveReminderOffset({
      due_at: dueAt,
      reminder_enabled: true,
      reminder_offset_minutes: null,
      default_reminder_minutes: 180,
    }),
    180,
  );
});

test("reminder base precedence is explicit, due, planned, then none", () => {
  assert.deepEqual(
    reminderBase({
      reminder_at: "2026-09-10T16:00:00.000Z",
      due_at: "2026-09-10T18:00:00.000Z",
      planned_start_at: "2026-09-10T17:00:00.000Z",
    }),
    { at: "2026-09-10T16:00:00.000Z", source: "reminder_at" },
  );
  assert.equal(
    reminderBase({
      reminder_at: null,
      due_at: dueAt,
      planned_start_at: "2026-09-10T17:00:00.000Z",
    })?.source,
    "due_at",
  );
  assert.equal(
    reminderBase({
      reminder_at: null,
      due_at: null,
      planned_start_at: "2026-09-10T17:00:00.000Z",
    })?.source,
    "planned_start_at",
  );
  assert.equal(
    reminderBase({
      reminder_at: null,
      due_at: null,
      planned_start_at: null,
    }),
    null,
  );
});

test("expired reminders outside the two-hour grace window are skipped", () => {
  const remindAt = remindAtIso(dueAt, 30);
  assert.equal(
    reminderDispatchState(new Date("2026-09-10T20:00:00.000Z"), remindAt),
    "expired",
  );
});

test("changed due_at or offset resets delivery, title-only would not", () => {
  assert.equal(
    shouldResetReminderDelivery({
      previousDueAt: dueAt,
      nextDueAt: "2026-09-10T19:00:00.000Z",
      previousOffset: null,
      nextOffset: null,
      previousEnabled: true,
      nextEnabled: true,
    }),
    true,
  );
  assert.equal(
    shouldResetReminderDelivery({
      previousDueAt: dueAt,
      nextDueAt: dueAt,
      previousOffset: null,
      nextOffset: null,
      previousEnabled: true,
      nextEnabled: true,
    }),
    false,
  );
  assert.equal(
    shouldResetReminderDelivery({
      previousReminderAt: null,
      nextReminderAt: "2026-09-10T17:00:00.000Z",
      previousDueAt: dueAt,
      nextDueAt: dueAt,
      previousPlannedStartAt: null,
      nextPlannedStartAt: null,
      previousOffset: null,
      nextOffset: null,
      previousEnabled: true,
      nextEnabled: true,
    }),
    true,
  );
  assert.equal(
    shouldResetReminderDelivery({
      previousDueAt: null,
      nextDueAt: null,
      previousPlannedStartAt: "2026-09-10T17:00:00.000Z",
      nextPlannedStartAt: "2026-09-10T18:00:00.000Z",
      previousOffset: 30,
      nextOffset: 30,
      previousEnabled: true,
      nextEnabled: true,
    }),
    true,
  );
});

test("push endpoints are validated", () => {
  assert.equal(
    validPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"),
    true,
  );
  assert.equal(validPushEndpoint("http://fcm.googleapis.com/fcm/send/abc"), false);
  assert.equal(validPushEndpoint("https://example.com/push"), false);
});
