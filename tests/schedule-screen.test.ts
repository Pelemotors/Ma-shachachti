import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, type Action } from "../lib/model";
import { applyActions, buildDailyPlanSession } from "../lib/engine";
import {
  foldHomeTodayTasks,
  getHomeTodayTasks,
} from "../lib/domain/planning/home-today";
import {
  formatShortDate,
  groupScheduleRows,
  planForDate,
  scheduleRowsForPlan,
} from "../lib/domain/planning/schedule-day";
import { shiftDateKey, startOfDateKey } from "../lib/time";

const NOW = new Date("2026-09-09T10:00:00+03:00");
const TZ = "Asia/Jerusalem";

function createTask(title: string, id: string): Action {
  return {
    type: "task.create",
    task: {
      id,
      title,
      categoryId: "floors",
      kind: "task",
      workMinutes: 20,
      waitMinutes: 0,
      effort: 2,
      priority: 2,
    },
  };
}

async function seedPlan() {
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  let s = emptyState();
  s = applyActions(
    s,
    ids.map((id, i) => createTask(`משימה ${i + 1}`, id)),
    NOW,
    true,
  );
  const session = buildDailyPlanSession(s, 120, 2, 1, NOW);
  s = applyActions(s, [{ type: "plan.set", plan: session }], NOW, true);
  return { s, ids, session };
}

test("planForDate uses the stored DailyPlan for that date only", async () => {
  const { s, session } = await seedPlan();
  assert.equal(planForDate(s, session.date)?.id, session.id);
  assert.equal(planForDate(s, shiftDateKey(session.date, 1)), null);
});

test("removing a plan item skips it without deleting the task", async () => {
  const { s, ids } = await seedPlan();
  const next = applyActions(
    s,
    [
      {
        type: "plan.itemUpdate",
        taskId: ids[0],
        patch: { planStatus: "skipped", locked: true },
      },
    ],
    NOW,
    true,
  );
  assert.ok(next.tasks.some((t) => t.id === ids[0] && t.status === "open"));
  const rows = scheduleRowsForPlan(next, next.planning.plan!, TZ);
  assert.ok(!rows.some((row) => row.item.taskId === ids[0]));
  const home = getHomeTodayTasks(next, NOW);
  assert.ok(!home.tasks.some((t) => t.id === ids[0]));
});

test("moving a scheduled task to another day keeps the same task id", async () => {
  const { s, ids } = await seedPlan();
  const tomorrow = startOfDateKey(shiftDateKey("2026-09-09", 1), TZ);
  const next = applyActions(
    s,
    [{ type: "task.deferUntil", id: ids[1], hiddenUntil: tomorrow }],
    NOW,
    true,
  );
  const task = next.tasks.find((t) => t.id === ids[1]);
  assert.ok(task);
  assert.equal(task!.status, "open");
  assert.equal(task!.hiddenUntil, tomorrow);
});

test("schedule groups timed items by existing stamps only", async () => {
  const { s } = await seedPlan();
  const rows = scheduleRowsForPlan(s, s.planning.plan!, TZ);
  assert.ok(rows.length >= 1);
  for (const row of rows) {
    if (!row.item.plannedStart) assert.equal(row.timeLabel, null);
    else assert.ok(row.timeLabel);
  }
  const groups = groupScheduleRows(rows);
  assert.ok(groups.every((group) => group.items.length > 0));
});

test("home fold keeps DailyPlan compact", async () => {
  const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
  let s = emptyState();
  s = applyActions(
    s,
    ids.map((id, i) => createTask(`ארוכה ${i + 1}`, id)),
    NOW,
    true,
  );
  const session = buildDailyPlanSession(s, 180, 2, 1, NOW);
  s = applyActions(s, [{ type: "plan.set", plan: session }], NOW, true);
  const home = getHomeTodayTasks(s, NOW);
  assert.equal(home.source, "daily_plan");
  assert.ok(home.tasks.length >= 3);
  assert.equal(foldHomeTodayTasks(home.tasks, home.source).length, 3);
});

test("date helpers stay calendar-stable", () => {
  assert.equal(shiftDateKey("2026-09-09", -1), "2026-09-08");
  assert.equal(shiftDateKey("2026-09-09", 1), "2026-09-10");
  assert.equal(formatShortDate("2026-09-09"), "9.9");
  assert.match(startOfDateKey("2026-09-10", TZ), /^2026-09-09T21:00:00/);
});

test("old regular-day CTA is gone from the plan screen", async () => {
  const fs = await import("node:fs/promises");
  const setup = await fs.readFile(
    new URL("../components/views/plan-setup-view.tsx", import.meta.url),
    "utf8",
  );
  const schedule = await fs.readFile(
    new URL("../components/views/daily-schedule-view.tsx", import.meta.url),
    "utf8",
  );
  const home = await fs.readFile(
    new URL("../components/views/home-view.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(setup, /היום כרגיל — בנה תוכנית/);
  assert.doesNotMatch(schedule, /היום כרגיל — בנה תוכנית/);
  assert.match(schedule, /הלו״ז שלי/);
  assert.match(schedule, /בנה לי לו״ז/);
  assert.match(home, /מה שונה היום\?/);
  assert.match(home, /ללו״ז המלא/);
});
