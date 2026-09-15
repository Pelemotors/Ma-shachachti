import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildScheduleFallbackPresentation,
  ensureSchedulePresentation,
  resolveSchedulePlanPresentation,
} from "../lib/presentation.ts";
import type { TaskRow } from "../lib/types.ts";

function task(id: string, title: string): TaskRow {
  return {
    id,
    title,
    notes: "",
    status: "open",
    due_on: null,
    due_at: null,
    reminder_enabled: false,
    reminder_at: null,
    planned_start_at: null,
    planned_end_at: null,
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
  };
}

test("late-night schedule_plan keeps typed presentation instead of null", () => {
  const tasks = [task("11111111-1111-4111-8111-111111111111", "לסדר בית")];
  const raw = {
    type: "schedule_plan",
    date: "2026-09-15",
    saved: false,
    items: [
      {
        task_id: tasks[0]!.id,
        title: "לסדר בית",
        planned_start: "09:00",
        planned_end: "10:00",
        fixed: false,
      },
    ],
  };
  const late = new Date("2026-09-15T21:45:00+03:00");
  const resolved = resolveSchedulePlanPresentation(raw, tasks, late);
  assert.equal(resolved?.type, "schedule_plan");
  assert.equal(resolved?.items.length, 0);

  const ensured = ensureSchedulePresentation({
    presentation: resolved,
    scopedPresentation: raw,
    tasks,
    targetDate: "2026-09-15",
    dayStart: "08:00",
    dayEnd: "22:00",
    now: late,
  });
  assert.equal(ensured.type, "schedule_plan");
  // After 21:45 with day_end 22:00 there may be no room — still typed plan.
  assert.ok(ensured.date === "2026-09-15");
});

test("schedule fallback builds future slots from open tasks", () => {
  const tasks = [
    task("11111111-1111-4111-8111-111111111111", "חשוב"),
    task("22222222-2222-4222-8222-222222222222", "רגיל"),
  ];
  const morning = new Date("2026-09-15T09:00:00+03:00");
  const plan = buildScheduleFallbackPresentation({
    tasks,
    date: "2026-09-15",
    dayStart: "08:00",
    dayEnd: "22:00",
    now: morning,
  });
  assert.equal(plan.type, "schedule_plan");
  assert.ok(plan.items.length >= 1);
  assert.ok(plan.items[0]!.planned_start >= "09:00");
});

test("ensureSchedulePresentation recovers when model omitted presentation", () => {
  const tasks = [task("11111111-1111-4111-8111-111111111111", "לסדר")];
  const plan = ensureSchedulePresentation({
    presentation: null,
    scopedPresentation: null,
    tasks,
    targetDate: "2026-09-16",
    dayStart: "08:00",
    dayEnd: "22:00",
    now: new Date("2026-09-15T23:00:00+03:00"),
  });
  assert.equal(plan.type, "schedule_plan");
  assert.equal(plan.date, "2026-09-16");
  assert.ok(plan.items.length >= 1);
});
