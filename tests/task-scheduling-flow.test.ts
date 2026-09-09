import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, migrateState, type Action } from "../lib/model";
import { applyActions } from "../lib/engine";
import { planForDate } from "../lib/domain/planning/schedule-day";
import {
  stampScheduleCreateRefs,
  stampTaskCreateIds,
} from "../lib/domain/planning/plan-intent";
import { glueTaskScheduleActions, partitionActionsByPolicy } from "../lib/agent/schema";
import { AGENT_CAPABILITY_TYPES } from "../lib/agent/capabilities";
import { readFileSync } from "node:fs";

const NOW = new Date("2026-09-09T10:00:00+03:00");
const DAY_A = "2026-09-09";
const DAY_B = "2026-09-10";

function createTask(title: string, id?: string): Action {
  return {
    type: "task.create",
    task: {
      id,
      title,
      kind: "task",
      workMinutes: 20,
      waitMinutes: 0,
      effort: 2,
      priority: 2,
    },
  };
}

test("legacy planning.plan migrates into planning.plans by date", () => {
  const taskId = crypto.randomUUID();
  const planId = crypto.randomUUID();
  const migrated = migrateState({
    ...emptyState(),
    planning: {
      today: null,
      plan: {
        id: planId,
        date: DAY_A,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        availableMinutes: 120,
        effort: 2,
        generatedFromRevision: 1,
        items: [
          {
            taskId,
            order: 0,
            plannedStart: null,
            plannedEnd: null,
            locked: false,
            planStatus: "planned",
          },
        ],
      },
    },
  });
  assert.equal(migrated.planning.plans[DAY_A]?.id, planId);
  assert.equal(planForDate(migrated, DAY_A)?.id, planId);
  assert.equal((migrated.planning as { plan?: unknown }).plan, undefined);
});

test("G/H: plan.set for day B does not erase day A", () => {
  const idA = crypto.randomUUID();
  const idB = crypto.randomUUID();
  let s = applyActions(emptyState(), [createTask("א", idA), createTask("ב", idB)], NOW, true);
  s = applyActions(
    s,
    [
      {
        type: "plan.set",
        plan: {
          id: crypto.randomUUID(),
          date: DAY_A,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
          availableMinutes: 60,
          effort: 2,
          generatedFromRevision: 1,
          items: [
            {
              taskId: idA,
              order: 0,
              plannedStart: null,
              plannedEnd: null,
              locked: false,
              planStatus: "planned",
            },
          ],
        },
      },
    ],
    NOW,
    true,
  );
  const firstId = planForDate(s, DAY_A)!.id;
  s = applyActions(
    s,
    [
      {
        type: "plan.set",
        plan: {
          id: crypto.randomUUID(),
          date: DAY_B,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
          availableMinutes: 90,
          effort: 1,
          generatedFromRevision: 2,
          items: [
            {
              taskId: idB,
              order: 0,
              plannedStart: null,
              plannedEnd: null,
              locked: false,
              planStatus: "planned",
            },
          ],
        },
      },
    ],
    NOW,
    true,
  );
  assert.equal(planForDate(s, DAY_A)?.id, firstId);
  assert.equal(planForDate(s, DAY_A)?.items[0]?.taskId, idA);
  assert.equal(planForDate(s, DAY_B)?.items[0]?.taskId, idB);
});

test("I: schedule.remove unschedules without deleting the task", () => {
  const id = crypto.randomUUID();
  let s = applyActions(emptyState(), [createTask("ביטוח", id)], NOW, true);
  s = applyActions(
    s,
    [{ type: "schedule.set", taskId: id, date: DAY_A }],
    NOW,
    true,
  );
  assert.equal(planForDate(s, DAY_A)?.items.some((item) => item.taskId === id), true);
  s = applyActions(
    s,
    [{ type: "schedule.remove", taskId: id, date: DAY_A }],
    NOW,
    true,
  );
  assert.equal(planForDate(s, DAY_A)?.items.some((item) => item.taskId === id), false);
  assert.equal(s.tasks.find((task) => task.id === id)?.status, "open");
});

test("C: schedule.set can place a day without inventing a clock time", () => {
  const id = crypto.randomUUID();
  let s = applyActions(emptyState(), [createTask("תור", id)], NOW, true);
  s = applyActions(
    s,
    [{ type: "schedule.set", taskId: id, date: "2026-09-10", dayPart: "morning" }],
    NOW,
    true,
  );
  const item = planForDate(s, "2026-09-10")?.items.find((row) => row.taskId === id);
  assert.ok(item);
  assert.equal(item!.plannedStart, null);
  assert.equal(item!.dayPart, "morning");
});

test("same-turn task.create + schedule.set share a stamped id", () => {
  const stamped = stampScheduleCreateRefs([
    createTask("אוכל לכלב"),
    { type: "schedule.set", date: DAY_A, createIndex: 0 },
  ]);
  const create = stamped[0];
  const place = stamped[1];
  assert.equal(create.type, "task.create");
  assert.equal(place.type, "schedule.set");
  if (create.type === "task.create" && place.type === "schedule.set") {
    assert.ok(create.task.id);
    assert.equal(place.taskId, create.task.id);
  }
  let s = applyActions(emptyState(), stamped, NOW, true);
  const id = create.type === "task.create" ? create.task.id : "";
  assert.ok(s.tasks.some((task) => task.id === id));
  assert.ok(planForDate(s, DAY_A)?.items.some((item) => item.taskId === id));
});

test("task.create + schedule.set stay in one proposal", () => {
  const actions: Action[] = [
    createTask("אוכל לכלב", crypto.randomUUID()),
    { type: "schedule.set", taskId: crypto.randomUUID(), date: DAY_A },
  ];
  const glued = glueTaskScheduleActions(
    actions.filter((action) => action.type === "schedule.set"),
    actions.filter((action) => action.type === "task.create"),
  );
  assert.equal(glued.auto.length, 0);
  assert.equal(glued.proposal.length, 2);
  const partitioned = partitionActionsByPolicy(actions, {
    initiative: "user_requested",
  });
  assert.ok(partitioned.proposal.some((action) => action.type === "task.create"));
  assert.ok(partitioned.proposal.some((action) => action.type === "schedule.set"));
});

test("capabilities expose schedule.set and schedule.remove", () => {
  assert.ok(AGENT_CAPABILITY_TYPES.includes("schedule.set"));
  assert.ok(AGENT_CAPABILITY_TYPES.includes("schedule.remove"));
});

test("changed-day UI talks to the same chat agent with selectedDate", async () => {
  const controller = readFileSync(
    new URL("../hooks/use-daily-plan-controller.ts", import.meta.url),
    "utf8",
  );
  assert.match(controller, /surface: "planning"/);
  assert.match(controller, /selectedDate/);
  assert.doesNotMatch(
    controller,
    /Functional contract: changedDay always reaches planning constraint/,
  );
  const setup = readFileSync(
    new URL("../components/views/plan-setup-view.tsx", import.meta.url),
    "utf8",
  );
  assert.match(setup, /מה שונה ביום הזה\?/);
});

test("stampTaskCreateIds still assigns ids for unscheduled creates", () => {
  const stamped = stampTaskCreateIds([createTask("מתישהו לבדוק ביטוח")]);
  assert.equal(stamped[0]?.type, "task.create");
  if (stamped[0]?.type === "task.create") assert.ok(stamped[0].task.id);
});
