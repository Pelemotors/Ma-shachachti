import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, type Action } from "../lib/model";
import { applyActions, activeDailyPlan } from "../lib/engine";
import {
  syncDailyPlanAfterActions,
  actionAffectsDailyPlan,
} from "../lib/domain/planning/sync-daily-plan";
import { getHomeTodayTasks } from "../lib/domain/planning/home-today";
import {
  countPlannedCreates,
  resolveRequestedTodayTaskIds,
  stampTaskCreateIds,
} from "../lib/domain/planning/plan-intent";
import { isActiveVisibleTask } from "../lib/domain/tasks/visibility";
import { dayKey } from "../lib/time";

const NOW = new Date("2026-09-08T10:00:00+03:00"); // Tuesday

function createTask(title: string, id?: string): Action {
  return {
    type: "task.create",
    task: {
      id: id ?? crypto.randomUUID(),
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

test("stampTaskCreateIds assigns server UUIDs", () => {
  const stamped = stampTaskCreateIds([
    {
      type: "task.create",
      task: {
        title: "בלי מזהה",
        categoryId: "floors",
        kind: "task",
        workMinutes: 15,
        waitMinutes: 0,
        effort: 1,
        priority: 1,
      },
    },
  ]);
  assert.equal(stamped[0].type, "task.create");
  if (stamped[0].type === "task.create") {
    assert.match(stamped[0].task.id!, /^[0-9a-f-]{36}$/i);
  }
});

test("PlanIntent: requested creates land in plan and Home under capacity pressure", () => {
  let s = emptyState();
  // Fill with high-priority routine noise that would otherwise win ranking.
  for (let i = 0; i < 6; i++) {
    s = applyActions(
      s,
      [
        {
          type: "task.create",
          task: {
            id: crypto.randomUUID(),
            title: `שגרה ${i}`,
            categoryId: "laundry",
            kind: "task",
            workMinutes: 25,
            waitMinutes: 0,
            effort: 2,
            priority: 3,
          },
        },
      ],
      NOW,
      true,
    );
  }
  const ids = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  ];
  const creates = [
    createTask("מדיח", ids[0]),
    createTask("כביסה היום", ids[1]),
    createTask("סלון", ids[2]),
    createTask("שטיפה", ids[3]),
  ];
  // Lower priority than noise — only PlanIntent boost should prefer them.
  for (const c of creates) {
    if (c.type === "task.create") c.task.priority = 1;
  }
  const date = dayKey(NOW, s.profile.timezone);
  s = applyActions(
    s,
    [
      ...creates,
      ...ids.map(
        (taskId): Action => ({ type: "schedule.set", taskId, date }),
      ),
    ],
    NOW,
    true,
  );

  const plan = activeDailyPlan(s, NOW);
  assert.ok(plan);
  const plannedIds = new Set(plan!.items.map((i) => i.taskId));
  const hit = ids.filter((id) => plannedIds.has(id));
  assert.ok(
    hit.length >= 2,
    `expected requested tasks in plan, got ${hit.length}`,
  );
  assert.equal(countPlannedCreates(ids, plan!.items), hit.length);

  const home = getHomeTodayTasks(s, NOW);
  assert.equal(home.source, "daily_plan");
  assert.ok(home.tasks.some((t) => ids.includes(t.id)));
});

test("task.create without today intent does not replan existing plan", () => {
  let s = emptyState();
  const keepId = crypto.randomUUID();
  s = applyActions(
    s,
    [
      createTask("בלוז", keepId),
      {
        type: "schedule.set",
        taskId: keepId,
        date: dayKey(NOW, s.profile.timezone),
      },
    ],
    NOW,
    true,
  );
  const before = activeDailyPlan(s, NOW)!;
  const future = createTask("ביטוח בחודש הבא", crypto.randomUUID());
  if (future.type === "task.create") {
    future.task.dueAt = "2026-10-15T10:00:00.000Z";
    future.task.priority = 3;
  }
  s = applyActions(s, [future], NOW, true);
  const afterSync = syncDailyPlanAfterActions({
    state: s,
    actions: [future],
    affectsToday: false,
    requestedTodayTaskIds: [],
    now: NOW,
    revision: 2,
  });
  assert.equal(afterSync.planSynced, false);
  assert.equal(activeDailyPlan(afterSync.state, NOW)?.id, before.id);
  assert.ok(
    !actionAffectsDailyPlan(future),
  );
});

test("countPlannedCreates never uses Math.min fallback", () => {
  assert.equal(
    countPlannedCreates(
      ["a", "b"],
      [{ taskId: "x" }, { taskId: "y" }, { taskId: "z" }],
    ),
    0,
  );
  assert.equal(
    countPlannedCreates(["a", "b"], [{ taskId: "a" }, { taskId: "z" }]),
    1,
  );
});

test("resolveRequestedTodayTaskIds defaults all creates when affectsToday", () => {
  const actions = stampTaskCreateIds([createTask("א"), createTask("ב")]);
  const ids = resolveRequestedTodayTaskIds({
    actions,
    affectsToday: true,
  });
  assert.equal(ids.length, 2);
});

test("acceptance: create → plan sync → home → defer → replan hides deferred", () => {
  let s = emptyState();
  const ids = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  ];
  const creates = [
    createTask("משימה א", ids[0]),
    createTask("משימה ב", ids[1]),
    createTask("משימה ג", ids[2]),
    createTask("משימה ד", ids[3]),
  ];
  const date = dayKey(NOW, s.profile.timezone);
  s = applyActions(
    s,
    [
      ...creates,
      ...ids.map(
        (taskId): Action => ({ type: "schedule.set", taskId, date }),
      ),
    ],
    NOW,
    true,
  );

  const before = getHomeTodayTasks(s, NOW);
  assert.equal(before.source, "daily_plan");
  assert.equal(before.tasks.length, 4);

  const defer: Action = { type: "task.defer", id: ids[0] };
  s = applyActions(s, [defer], NOW, true);
  s = syncDailyPlanAfterActions({
    state: s,
    actions: [defer],
    now: NOW,
    revision: 3,
  }).state;

  const after = getHomeTodayTasks(s, NOW);
  assert.equal(after.source, "daily_plan");
  assert.ok(!after.tasks.some((t) => t.id === ids[0]));
  assert.equal(
    isActiveVisibleTask(
      s.tasks.find((t) => t.id === ids[0])!,
      NOW,
    ),
    false,
  );
});

test("profile cleaningDays defaults via emptyState / migrate dual-read", () => {
  const s = emptyState();
  assert.deepEqual(s.profile.householdRoutines.cleaningDays, []);
  assert.equal(s.profile.cleaner.enabled, false);
  const migrated = applyActions(
    s,
    [
      {
        type: "profile.update",
        patch: {
          householdRoutines: { cleaningDays: [2] },
          cleaner: { enabled: true, visitsPerWeek: 1, days: [2] },
        },
      },
    ],
    NOW,
    true,
  );
  assert.deepEqual(migrated.profile.householdRoutines.cleaningDays, [2]);
  assert.equal(migrated.profile.cleaner.enabled, true);
});

test("UI rename string: מה שונה היום is the plan CTA label", async () => {
  const fs = await import("node:fs/promises");
  const home = await fs.readFile(
    new URL("../components/views/home-view.tsx", import.meta.url),
    "utf8",
  );
  assert.match(home, /מה שונה היום\?/);
  assert.doesNotMatch(home, /צור לי לו״ז להיום/);
});
