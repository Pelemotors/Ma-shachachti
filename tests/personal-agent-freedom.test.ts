import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, type Action } from "../lib/model";
import { applyActions } from "../lib/engine";
import {
  AgentActionSchema,
  agentDecisionJsonSchema,
  classifyActionPolicy,
  normalizeLooseAgentAction,
} from "../lib/agent/schema";
import { filterRunnableActions } from "../lib/agent/action-validation";
import { filterReferentialActions } from "../lib/agent/referential-integrity";
import { buildAgentContext } from "../lib/domain/agent-context";
import {
  isRoutineDueToday,
  materializeDueRoutinesInPlace,
} from "../lib/domain/routines";
import {
  isRoutineHousehold,
  rankForgotten,
} from "../lib/domain/forgotten";

const NOW = new Date("2026-09-09T07:00:00Z");

test("agent capability contract includes semantic task categories and excludes internal scan", () => {
  const schema = JSON.stringify(agentDecisionJsonSchema());
  assert.match(schema, /garden_yard/);
  assert.match(schema, /routine\.create/);
  assert.equal(
    AgentActionSchema.some((x) => x.shape.type.value === "scan.set"),
    false,
  );
  assert.equal(
    AgentActionSchema.some((x) => x.shape.type.value === "profile.update"),
    true,
  );
});

test("profile capability strips protected settings but keeps household facts", () => {
  const normalized = normalizeLooseAgentAction({
    type: "profile.update",
    patch: { garden: true, dishwasher: true, aiConsent: false, themeMode: "fixed" },
  }) as { patch: Record<string, unknown> };
  assert.equal(normalized.patch.garden, true);
  assert.equal(normalized.patch.dishwasher, true);
  assert.equal("aiConsent" in normalized.patch, false);
  assert.equal("themeMode" in normalized.patch, false);
});

test("routine is first-class and materializes at most one occurrence per day", () => {
  let state = emptyState();
  const routineId = crypto.randomUUID();
  state = applyActions(
    state,
    [
      {
        type: "routine.create",
        routine: {
          id: routineId,
          title: "להפעיל מדיח בקבוקים",
          categoryId: "kitchen_dishes",
          schedule: { frequency: "daily", interval: 1 },
          timeOfDay: "evening",
        },
      },
    ],
    NOW,
    true,
  );

  assert.equal(state.routines.length, 1);
  assert.equal(isRoutineDueToday(state.routines[0]!, NOW, state.profile.timezone), true);
  const first = state.tasks.filter((t) => t.routineId === routineId);
  assert.equal(first.length, 1);
  assert.ok(first[0]!.preferredWindow?.start);
  assert.ok(first[0]!.preferredWindow?.end);

  materializeDueRoutinesInPlace(state, NOW);
  assert.equal(state.tasks.filter((t) => t.routineId === routineId).length, 1);
});

test("removing a source fact pauses its routine without deleting task history", () => {
  let state = applyActions(
    emptyState(),
    [
      {
        type: "fact.add",
        text: "כל ערב להפעיל מדיח בקבוקים",
        kind: "stable",
        expiresAt: null,
      },
    ],
    NOW,
    true,
  );
  const factId = state.facts[0]!.id;
  const routineId = crypto.randomUUID();
  state = applyActions(
    state,
    [
      {
        type: "routine.create",
        routine: {
          id: routineId,
          title: "להפעיל מדיח בקבוקים",
          schedule: { frequency: "daily", interval: 1 },
          timeOfDay: "evening",
          sourceFactId: factId,
        },
      },
    ],
    NOW,
    true,
  );
  const occurrenceId = state.tasks.find((t) => t.routineId === routineId)!.id;

  state = applyActions(
    state,
    [{ type: "fact.remove", id: factId }],
    NOW,
    true,
  );

  assert.equal(state.routines.find((r) => r.id === routineId)?.status, "paused");
  assert.ok(state.tasks.some((t) => t.id === occurrenceId));
});

test("routine semantics come from routineId, not household category", () => {
  let state = applyActions(
    emptyState(),
    [
      {
        type: "task.create",
        task: {
          title: "לנקות מטבח חד פעמי",
          categoryId: "kitchen_dishes",
          priority: 1,
        },
      },
    ],
    NOW,
    true,
  );
  const oneOff = state.tasks[0]!;
  assert.equal(isRoutineHousehold(oneOff), false);
  assert.ok(rankForgotten(state, NOW, 20).some((x) => x.task.id === oneOff.id));

  state = applyActions(
    state,
    [
      {
        type: "routine.create",
        routine: {
          id: crypto.randomUUID(),
          title: "סידור מטבח יומי",
          categoryId: "kitchen_dishes",
          schedule: { frequency: "daily", interval: 1 },
        },
      },
    ],
    NOW,
    true,
  );
  const routineTask = state.tasks.find((t) => t.routineId)!;
  assert.equal(isRoutineHousehold(routineTask), true);
});

test("agent context exposes routines and the full safe household profile", () => {
  let state = emptyState();
  state.profile.garden = true;
  state.profile.dishwasher = true;
  state = applyActions(
    state,
    [
      {
        type: "routine.create",
        routine: {
          title: "להשקות עציצים",
          categoryId: "garden_yard",
          schedule: { frequency: "weekly", interval: 1, weekdays: [0, 3] },
        },
      },
    ],
    NOW,
    true,
  );
  const context = buildAgentContext(state, { now: NOW, surface: "memory" });
  assert.equal(context.profile.garden, true);
  assert.equal(context.profile.dishwasher, true);
  assert.equal(context.routines.length, 1);
  assert.equal(context.userKnowledge.routines.length, 1);
  assert.equal(context.surface, "memory");
});

test("ordered action validation supports create then linked reminder", () => {
  const taskId = crypto.randomUUID();
  const actions: Action[] = [
    {
      type: "task.create",
      task: { id: taskId, title: "לצאת מהבית" },
    },
    {
      type: "reminder.add",
      title: "לצאת מהבית",
      dueAt: "2030-01-01T10:00:00Z",
      taskId,
    },
  ];
  const result = filterRunnableActions(emptyState(), actions, NOW);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.rejected.length, 0);
});

test("referential integrity validates routine ids and destructive policy proposes removal", () => {
  const missing = crypto.randomUUID();
  const filtered = filterReferentialActions(emptyState(), [
    { type: "routine.pause", id: missing, paused: true },
  ]);
  assert.equal(filtered.kept.length, 0);
  assert.equal(filtered.rejected.length, 1);
  assert.equal(
    classifyActionPolicy({ type: "routine.remove", id: missing }),
    "proposal",
  );
});
