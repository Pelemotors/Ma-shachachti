import assert from "node:assert/strict";
import test from "node:test";
import { buildForgottenSurface } from "../lib/forgotten-surface.ts";
import type { TaskRow } from "../lib/types.ts";

function task(partial: Partial<TaskRow> & Pick<TaskRow, "id" | "title">): TaskRow {
  return {
    notes: "",
    status: "open",
    due_on: null,
    due_at: null,
    reminder_at: null,
    reminder_offset_minutes: null,
    reminder_enabled: false,
    reminder_sent_at: null,
    reminder_claimed_at: null,
    planned_start_at: null,
    planned_end_at: null,
    reschedule_count: 0,
    last_rescheduled_at: null,
    created_at: "2026-09-01T08:00:00.000Z",
    updated_at: "2026-09-01T08:00:00.000Z",
    completed_at: null,
    ...partial,
  };
}

test("M8 attention ranks urgent and missed-reminder work and excludes low-signal items", () => {
  const now = new Date("2026-09-29T10:00:00.000Z");
  const surface = buildForgottenSurface({
    now,
    planTaskIds: ["already-planned"],
    routineTaskIds: ["routine"],
    tasks: [
      task({ id: "overdue", title: "Overdue", due_on: "2026-09-28" }),
      task({ id: "tomorrow", title: "Tomorrow", due_on: "2026-09-30" }),
      task({ id: "missed", title: "Missed reminder", reminder_enabled: true, reminder_at: "2026-09-29T08:00:00.000Z" }),
      task({ id: "rescheduled", title: "Rescheduled", reschedule_count: 2 }),
      task({ id: "consequence", title: "Blocked", notes: "needs attention" }),
      task({ id: "undated", title: "No deadline" }),
      task({ id: "far", title: "Far away", due_on: "2026-11-29" }),
      task({ id: "routine", title: "Routine" }),
      task({ id: "already-planned", title: "Already planned" }),
      task({ id: "done", title: "Done", status: "done" }),
    ],
  });
  const ids = surface.sections.flatMap((section) => section.items.map((item) => item.id));
  assert.ok(ids.length <= 6);
  assert.ok(ids.includes("overdue"));
  assert.ok(ids.includes("tomorrow"));
  assert.ok(ids.includes("missed"));
  assert.ok(ids.includes("rescheduled"));
  assert.ok(ids.length <= 6);
  assert.equal(ids.includes("undated"), false);
  assert.equal(ids.includes("far"), false);
  assert.equal(ids.includes("routine"), false);
  assert.equal(ids.includes("already-planned"), false);
  assert.equal(ids.includes("done"), false);
  assert.deepEqual(ids, [...ids]);
});
