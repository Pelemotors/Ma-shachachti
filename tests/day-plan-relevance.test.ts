import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeDayPlanItems, taskIdsForPlanDate } from "../lib/day-plan.ts";

test("replan keeps only due-that-day and already planned ids", () => {
  const tasks = [
    { id: "doctor", status: "open", due_on: "2026-09-21" },
    { id: "shoes", status: "open", due_on: "2026-09-25" },
    { id: "undated", status: "open", due_on: null },
    { id: "done", status: "done", due_on: "2026-09-21" },
  ];
  assert.deepEqual(
    taskIdsForPlanDate(tasks, "2026-09-21", ["doctor"]).sort(),
    ["doctor"],
  );
});

test("merge preserves fixed items and only appends new ids", () => {
  const existing = [
    {
      task_id: "doctor",
      start_at: "2026-09-21T14:00:00.000Z",
      end_at: "2026-09-21T15:00:00.000Z",
      kind: "fixed" as const,
      source: "manual" as const,
    },
    {
      task_id: "lunch",
      start_at: "2026-09-21T10:00:00.000Z",
      end_at: "2026-09-21T10:45:00.000Z",
      kind: "flexible" as const,
      source: "replan" as const,
    },
  ];
  const merged = mergeDayPlanItems(existing, ["doctor", "lunch", "new-task"], "2026-09-21", []);
  assert.equal(merged.length, 3);
  const doctor = merged.find((item) => item.task_id === "doctor");
  assert.equal(doctor?.start_at, "2026-09-21T14:00:00.000Z");
  assert.equal(doctor?.kind, "fixed");
  const lunch = merged.find((item) => item.task_id === "lunch");
  assert.equal(lunch?.start_at, "2026-09-21T10:00:00.000Z");
  assert.ok(merged.some((item) => item.task_id === "new-task" && item.kind === "flexible"));
});
