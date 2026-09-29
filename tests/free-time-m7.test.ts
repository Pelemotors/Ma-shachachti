import assert from "node:assert/strict";
import test from "node:test";
import { selectFreeTimeCandidates } from "../apps/mobile/src/product/freeTimeCandidates.ts";

const date = "2026-10-20";
const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  status: "open" as const,
  due_on: null,
  due_at: null,
  planned_start_at: null,
  planned_end_at: null,
  estimate_minutes: 20,
  created_at: `2026-0${(Number(id.slice(-1)) % 8) + 1}-01T00:00:00.000Z`,
  ...extra,
});

test("M7 free-time excludes routines, today's plan, urgent work, and closed tasks", () => {
  const candidates = selectFreeTimeCandidates({
    date,
    minutes: 30,
    tasks: [
      task("free-1"),
      task("free-2"),
      task("free-3"),
      task("routine-task"),
      task("planned-task"),
      task("tomorrow-task", { due_on: "2026-10-21" }),
      task("done-task", { status: "done" }),
    ],
    planItems: [{ task_id: "planned-task", start_at: "2026-10-20T09:00:00.000Z", kind: "flexible" }],
    routines: [{ id: "routine-1", task_id: "routine-task", weekdays: [1], time_of_day: "09:00", starts_on: date, ends_on: null, active: true }],
  });

  assert.deepEqual(candidates.map((row) => row.id).sort(), ["free-1", "free-2", "free-3"]);
});

test("M7 free-time returns another candidate set without changing inputs", () => {
  const tasks = [task("free-1"), task("free-2"), task("free-3"), task("free-4")];
  const first = selectFreeTimeCandidates({ tasks, planItems: [], routines: [], date, minutes: 30, limit: 3 });
  const other = selectFreeTimeCandidates({ tasks, planItems: [], routines: [], date, minutes: 30, offset: 3, limit: 3 });

  assert.notDeepEqual(other.map((row) => row.id), first.map((row) => row.id));
  assert.equal(tasks.length, 4);
  assert.deepEqual(tasks.map((row) => row.id), ["free-1", "free-2", "free-3", "free-4"]);
});
