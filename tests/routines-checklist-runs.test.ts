import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dayPlanItemFromRow, mergeDayPlanItems } from "../lib/day-plan.ts";
import { withRunChecks } from "../lib/checklist-runs.ts";
import {
  civilWeekday,
  plannedDurationMinutes,
  routineOccurrenceKey,
  syncRoutineItems,
  type RoutineSchedule,
} from "../lib/routine-schedule.ts";

const routine: RoutineSchedule = {
  id: "11111111-1111-4111-8111-111111111111",
  task_id: "22222222-2222-4222-8222-222222222222",
  weekdays: [0, 1, 2, 3, 4],
  time_of_day: "08:00:00",
  starts_on: "2026-09-01",
  ends_on: null,
  active: true,
};

test("weekday of a civil date does not depend on a local timezone", () => {
  assert.equal(civilWeekday("2026-09-26"), 6);
  assert.equal(civilWeekday("2026-09-28"), 1);
});

test("a deadline is not a schedule and an untimed routine gets no invented time", () => {
  const manual = {
    task_id: "doc",
    start_at: "2026-10-04T06:00:00.000Z",
    end_at: "2026-10-04T06:30:00.000Z",
    kind: "flexible" as const,
    source: "manual" as const,
  };
  const untimed = syncRoutineItems({
    date: "2026-10-04",
    routines: [{ ...routine, time_of_day: null }],
    exceptions: [],
    estimateByTaskId: {},
    existing: [manual],
  });
  assert.equal(untimed.changed, false);
  assert.deepEqual(untimed.items, [manual]);
});

test("Sun–Thu 08:00 appears on Monday, not on Saturday, and refresh does not duplicate", () => {
  const monday = syncRoutineItems({
    date: "2026-09-28",
    routines: [routine],
    exceptions: [],
    estimateByTaskId: { [routine.task_id]: 20 },
    existing: [],
  });
  assert.equal(monday.items.length, 1);
  assert.equal(monday.items[0]?.occurrence_key, routineOccurrenceKey(routine.id, "2026-09-28"));
  assert.equal(monday.items[0]?.routine_id, routine.id);
  assert.equal(monday.items[0]?.kind, "fixed");
  const span = Date.parse(monday.items[0]!.end_at!) - Date.parse(monday.items[0]!.start_at);
  assert.equal(span, 20 * 60 * 1000);
  const again = syncRoutineItems({
    date: "2026-09-28",
    routines: [routine],
    exceptions: [],
    estimateByTaskId: { [routine.task_id]: 20 },
    existing: monday.items,
  });
  assert.equal(again.changed, false);
  assert.equal(again.items.length, 1);

  const saturday = syncRoutineItems({
    date: "2026-09-26",
    routines: [routine],
    exceptions: [],
    estimateByTaskId: {},
    existing: [],
  });
  assert.equal(saturday.items.length, 0);
});

test("missing estimate uses the planner slot, not a fixed 30 minutes", () => {
  assert.equal(plannedDurationMinutes(null), 45);
  assert.equal(plannedDurationMinutes(30), 30);
  const placed = syncRoutineItems({
    date: "2026-09-28",
    routines: [routine],
    exceptions: [],
    estimateByTaskId: {},
    existing: [],
  });
  const span = Date.parse(placed.items[0]!.end_at!) - Date.parse(placed.items[0]!.start_at);
  assert.equal(span, 45 * 60 * 1000);
});

test("skip, override, and done keep occurrence identity", () => {
  const first = syncRoutineItems({
    date: "2026-09-28",
    routines: [routine],
    exceptions: [],
    estimateByTaskId: { [routine.task_id]: 30 },
    existing: [],
  });
  const skipped = syncRoutineItems({
    date: "2026-09-28",
    routines: [routine],
    exceptions: [{ routine_id: routine.id, occurrence_date: "2026-09-28", kind: "skip", time_of_day: null }],
    estimateByTaskId: {},
    existing: first.items,
  });
  assert.equal(skipped.items.length, 0);
  const overridden = syncRoutineItems({
    date: "2026-09-28",
    routines: [routine],
    exceptions: [{ routine_id: routine.id, occurrence_date: "2026-09-28", kind: "override", time_of_day: "09:30" }],
    estimateByTaskId: { [routine.task_id]: 30 },
    existing: first.items,
  });
  assert.equal(overridden.items.length, 1);
  assert.equal(overridden.items[0]?.occurrence_key, first.items[0]?.occurrence_key);
  assert.notEqual(overridden.items[0]?.start_at, first.items[0]?.start_at);
  const done = syncRoutineItems({
    date: "2026-09-28",
    routines: [routine],
    exceptions: [{ routine_id: routine.id, occurrence_date: "2026-09-28", kind: "done", time_of_day: null }],
    estimateByTaskId: {},
    existing: first.items,
  });
  assert.equal(done.changed, false);
  assert.equal(done.items[0]?.occurrence_key, first.items[0]?.occurrence_key);
});

test("stopping a routine does not delete an already materialized past occurrence during sync", () => {
  const existing = syncRoutineItems({
    date: "2026-09-28",
    routines: [routine],
    exceptions: [],
    estimateByTaskId: {},
    existing: [],
  }).items;
  const stopped = syncRoutineItems({
    date: "2026-09-28",
    routines: [{ ...routine, active: false }],
    exceptions: [],
    estimateByTaskId: {},
    existing,
  });
  assert.equal(stopped.changed, false);
  assert.equal(stopped.items.length, 1);
});

test("replan and row mapping keep routine identity", () => {
  const row = dayPlanItemFromRow({
    task_id: routine.task_id,
    start_at: "2026-09-28T05:00:00.000Z",
    end_at: "2026-09-28T05:30:00.000Z",
    kind: "fixed",
    source: "manual",
    routine_id: routine.id,
    occurrence_key: routineOccurrenceKey(routine.id, "2026-09-28"),
  });
  assert.ok(row);
  const merged = mergeDayPlanItems([row], [routine.task_id, "other"], "2026-09-28", []);
  const kept = merged.find((item) => item.task_id === routine.task_id);
  assert.equal(kept?.routine_id, routine.id);
  assert.equal(kept?.occurrence_key, routineOccurrenceKey(routine.id, "2026-09-28"));
  assert.equal(merged.filter((item) => item.task_id === routine.task_id).length, 1);
});

test("checklist execution state comes from the run, not the template", () => {
  const template = [
    { id: "a", text: "בקבוק", checked: true },
    { id: "b", text: "חיתולים", checked: true },
    { id: "c", text: "מגבונים", checked: false },
  ];
  const today = withRunChecks(template, new Set(["a", "b"]));
  const tomorrow = withRunChecks(template, new Set());
  assert.deepEqual(today.map((item) => item.checked), [true, true, false]);
  assert.deepEqual(tomorrow.map((item) => item.checked), [false, false, false]);
  assert.equal(template[0]?.checked, true);
});

test("day plan loading does not schedule tasks from a deadline", () => {
  const route = readFileSync(new URL("../app/api/day-plan/route.ts", import.meta.url), "utf8");
  const plan = readFileSync(new URL("../lib/day-plan.ts", import.meta.url), "utf8");
  assert.equal(route.includes("ensureDayPlanBaseline"), false);
  assert.equal(plan.includes("ensureDayPlanBaseline"), false);
  const actions = readFileSync(new URL("../lib/actions.ts", import.meta.url), "utf8");
  assert.equal(actions.includes("routine_id"), false);
  const migration = readFileSync(
    new URL("../database/migrations/20260926_tasks_routines_checklist_runs.sql", import.meta.url),
    "utf8",
  );
  assert.equal(migration.includes("drop policy if exists"), true);
  assert.equal(migration.includes("create_checklist_with_items"), true);
  assert.equal(/alter table public\.tasks[\s\S]{0,240}routine_id/.test(migration), false);
  const lists = readFileSync(new URL("../lib/lists.ts", import.meta.url), "utf8");
  assert.equal(lists.includes("create_checklist_with_items"), true);
  assert.match(lists, /delete\(\)\.eq\("user_id", userId\)\.eq\("id", created.id\)/);
});

test("dated tasks sort by closest deadline first", () => {
  const rows = [
    { title: "later", due_on: "2026-10-04" },
    { title: "sooner", due_on: "2026-09-27" },
  ];
  const sorted = [...rows].sort((left, right) => (left.due_on ?? "").localeCompare(right.due_on ?? ""));
  assert.deepEqual(sorted.map((row) => row.title), ["sooner", "later"]);
});
