import assert from "node:assert/strict";
import { test } from "node:test";
import {
  forgottenFallback,
  replyForPresentation,
  resolveAgentPresentation,
  resolveSchedulePlanPresentation,
  sanitizeCardReply,
} from "../lib/presentation.ts";
import { classifyScheduleDay } from "../lib/schedule.ts";
import { listUpcomingReminders } from "../lib/upcoming-reminders.ts";
import { applySurfaceTurnPolicy } from "../lib/agent/turn.ts";
import {
  mapGetUserMediaError,
  mapPermissionState,
  microphoneStatusLabel,
} from "../hooks/use-device-permissions.ts";
import { canPromptPushPermission, notificationUiState } from "../lib/push-client.ts";
import { jerusalemDateTimeToUtc } from "../lib/time.ts";
import type { TaskRow } from "../lib/types.ts";

const dog: TaskRow = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "להזמין אוכל לכלב",
  notes: "",
  status: "open",
  due_on: "2026-09-10",
  due_at: null,
  reminder_offset_minutes: null,
  reminder_enabled: true,
  reminder_sent_at: null,
  reminder_claimed_at: null,
  planned_start_at: null,
  planned_end_at: null,
  created_at: "2026-09-10T00:00:00.000Z",
  updated_at: "2026-09-10T00:00:00.000Z",
  completed_at: null,
};

const parents: TaskRow = {
  ...dog,
  id: "22222222-2222-4222-8222-222222222222",
  title: "יום הורים",
  due_on: "2026-09-10",
  due_at: "2026-09-10T14:00:00.000Z",
};

test("forgotten reply drops duplicated task dump", () => {
  const presentation = resolveAgentPresentation(
    { type: "task_list", task_ids: [dog.id] },
    [dog],
  );
  const reply = replyForPresentation(
    "יש כרגע דבר אחד שכדאי לשים עליו עין.\n1. **להזמין אוכל לכלב**",
    presentation,
  );
  assert.doesNotMatch(reply, /להזמין אוכל לכלב/);
  assert.doesNotMatch(reply, /1\./);
  assert.ok(reply.length < 80);
});

test("empty forgotten reply uses the safe fallback", () => {
  assert.equal(forgottenFallback(0), "כרגע אין משהו שנראה דחוף או שקל לפספס.");
  assert.equal(
    sanitizeCardReply("1. משימה", ["משימה"], forgottenFallback(0)),
    forgottenFallback(0),
  );
});

test("schedule_plan uses due_at for fixed tasks and drops past items", () => {
  const afternoon = new Date("2026-09-10T13:00:00.000Z");
  const resolved = resolveSchedulePlanPresentation(
    {
      type: "schedule_plan",
      date: "2026-09-10",
      items: [
        { task_id: parents.id, planned_start: "18:00", planned_end: null },
        { task_id: dog.id, planned_start: "21:00", planned_end: "21:15" },
      ],
    },
    [parents, dog],
    afternoon,
  );
  const fixed = resolved?.items.find((item) => item.task_id === parents.id);
  assert.equal(fixed?.planned_start, "17:00");
  assert.equal(fixed?.fixed, true);
  const later = resolveSchedulePlanPresentation(
    {
      type: "schedule_plan",
      date: "2026-09-10",
      items: [
        { task_id: parents.id, planned_start: "17:00", planned_end: null },
        { task_id: dog.id, planned_start: "21:00", planned_end: "21:15" },
      ],
    },
    [parents, dog],
    new Date("2026-09-10T15:00:00.000Z"),
  );
  assert.equal(later?.items.length, 1);
  assert.equal(later?.items[0]?.task_id, dog.id);
});

test("schedule_plan does not accept another user's task id", () => {
  const resolved = resolveSchedulePlanPresentation(
    {
      type: "schedule_plan",
      date: "2026-09-10",
      items: [
        {
          task_id: "33333333-3333-4333-8333-333333333333",
          planned_start: "21:00",
          planned_end: null,
        },
      ],
    },
    [dog],
    new Date("2026-09-10T10:00:00.000Z"),
  );
  assert.equal(resolved, null);
});

test("schedule surface keeps schedule_plan and drops mutations", () => {
  const scoped = applySurfaceTurnPolicy({
    surface: "schedule",
    actions: [{ type: "task.create" }],
    presentation: {
      type: "schedule_plan",
      date: "2026-09-10",
      items: [{ task_id: dog.id, planned_start: "21:00", planned_end: null }],
    },
  });
  assert.deepEqual(scoped.actions, []);
  assert.equal(scoped.presentation?.type, "schedule_plan");
});

test("my schedule separates fixed, planned, date-only and backlog", () => {
  const planned = {
    ...dog,
    id: "44444444-4444-4444-8444-444444444444",
    title: "קניות",
    due_on: null,
    due_at: null,
    planned_start_at: jerusalemDateTimeToUtc("2026-09-10", "11:30").toISOString(),
    planned_end_at: jerusalemDateTimeToUtc("2026-09-10", "12:00").toISOString(),
  };
  const dateOnly = {
    ...dog,
    id: "55555555-5555-4555-8555-555555555555",
    title: "לקנות מתנה",
    due_at: null,
  };
  const backlog = {
    ...dog,
    id: "66666666-6666-4666-8666-666666666666",
    title: "משימה כללית",
    due_on: null,
    due_at: null,
  };
  const day = classifyScheduleDay([parents, planned, dateOnly, backlog], "2026-09-10");
  assert.equal(day.timed.some((item) => item.fixed && item.task.id === parents.id), true);
  assert.equal(day.timed.some((item) => item.task.id === planned.id), true);
  assert.equal(day.throughout.some((task) => task.id === dateOnly.id), true);
  assert.equal(day.timed.some((item) => item.task.id === backlog.id), false);
  assert.equal(day.throughout.some((task) => task.id === backlog.id), false);
});

test("upcoming reminders hide sent, done, cancelled, disabled and date-only", () => {
  const now = new Date("2026-09-10T10:00:00.000Z");
  const future = {
    ...parents,
    due_at: "2026-09-10T18:00:00.000Z",
    reminder_offset_minutes: 0,
  };
  const sent = { ...future, id: "77777777-7777-4777-8777-777777777777", reminder_sent_at: now.toISOString() };
  const done = { ...future, id: "88888888-8888-4888-8888-888888888888", status: "done" as const };
  const listed = listUpcomingReminders(
    [future, sent, done, dog],
    30,
    now,
  );
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, future.id);
  assert.equal(listed[0]?.label, "בזמן המשימה");
});

test("device permission helpers stay honest", () => {
  assert.equal(mapPermissionState("prompt"), "prompt");
  assert.equal(microphoneStatusLabel("unknown"), "מיקרופון ממתין לאישור");
  assert.equal(microphoneStatusLabel("granted"), "מיקרופון מאושר");
  assert.equal(microphoneStatusLabel("denied"), "מיקרופון חסום");
  assert.equal(microphoneStatusLabel("unsupported"), "מיקרופון לא נתמך");
  const denied = mapGetUserMediaError(
    Object.assign(new DOMException("denied", "NotAllowedError")),
  );
  assert.equal(denied.status, "denied");
  assert.equal(notificationUiState({
    supported: true,
    permission: "granted",
    hasSubscription: false,
  }), "granted-unsubscribed");
  assert.equal(canPromptPushPermission("granted"), false);
  assert.equal(canPromptPushPermission("default"), true);
});
