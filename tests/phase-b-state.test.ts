import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  expandLearnedFollowUps,
  filterMemoryWritesForException,
  reconcileActions,
} from "../lib/agent/reconcile.ts";
import {
  encodeActionFollowupRelation,
  normalizeMemoryRelationActions,
  parseActionFollowupRelation,
  selectLearnedActionRelations,
} from "../lib/agent/learned-relations.ts";
import {
  isolatePendingScheduleActions,
  isScheduleDraftPending,
  resolveDayBoundsFromMemory,
} from "../lib/agent/schedule-isolation.ts";
import type { AgentAction, MemoryRow, TaskRow } from "../lib/types.ts";

function task(partial: Partial<TaskRow> & { id: string; title: string }): TaskRow {
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
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    completed_at: null,
    ...partial,
  };
}

function createAction(title: string, extra: Partial<AgentAction> = {}): AgentAction {
  return {
    type: "task.create",
    id: null,
    title,
    notes: null,
    due_on: "2026-09-16",
    due_time: null,
    due_patch: null,
    reminder_enabled: null,
    reminder_at: null,
    reminder_at_patch: null,
    reminder_offset_minutes: null,
    reminder_patch: null,
    plan_patch: null,
    planned_date: null,
    planned_start_time: null,
    planned_end_time: null,
    kind: null,
    content: null,
    confidence: null,
    silent: null,
    ...extra,
  };
}

test("reconcile turns duplicate create into update of existing open task", () => {
  const open = [task({ id: "11111111-1111-4111-8111-111111111111", title: "כביסה" })];
  const actions = reconcileActions({
    actions: [createAction("כביסה", { due_on: "2026-09-17", notes: "בלי קיפול" })],
    openTasks: open,
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.type, "task.update");
  assert.equal(actions[0]?.id, "11111111-1111-4111-8111-111111111111");
});

test("turn_flags suppress follow-ups without keyword regex", () => {
  const relations = [
    { trigger: "לנקות מקרר", followupTitle: "לזרוק זבל", ordering: "after" as const },
  ];
  const expanded = expandLearnedFollowUps({
    actions: [createAction("לנקות מקרר")],
    relations,
    openTasks: [],
    turnFlags: {
      suppress_learned_followups: false,
      standing_rule_change: false,
    },
  });
  assert.equal(expanded.length, 2);

  const suppressed = expandLearnedFollowUps({
    actions: [createAction("לנקות מקרר")],
    relations,
    openTasks: [],
    turnFlags: {
      suppress_learned_followups: true,
      standing_rule_change: false,
    },
  });
  assert.equal(suppressed.length, 1);

  // No hardcoded domain words / exception regex in reconcile module.
  const source = readFileSync(
    fileURLToPath(new URL("../lib/agent/reconcile.ts", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(source, /כביסה|קיפול|מקרר|זבל/);
  assert.doesNotMatch(source, /ONE_SHOT_EXCEPTION_RE|הפעם\\s\+בלי/);
});

test("suppress follow-ups blocks standing memory unless standing_rule_change", () => {
  const memoryAction = {
    ...createAction("x"),
    type: "memory.upsert" as const,
    title: null,
    content: encodeActionFollowupRelation({
      trigger: "A",
      followup: "B",
    }),
    kind: "fact" as const,
    confidence: "high" as const,
    silent: false,
  };
  assert.equal(
    filterMemoryWritesForException({
      actions: [memoryAction],
      turnFlags: {
        suppress_learned_followups: true,
        standing_rule_change: false,
      },
    }).length,
    0,
  );
  assert.equal(
    filterMemoryWritesForException({
      actions: [memoryAction],
      turnFlags: {
        suppress_learned_followups: true,
        standing_rule_change: true,
      },
    }).length,
    1,
  );
});

test("normalizeMemoryRelationActions repairs embedded JSON", () => {
  const wrapped = `שמור את זה: ${encodeActionFollowupRelation({
    trigger: "לנקות מקרר",
    followup: "לזרוק זבל",
  })} תודה`;
  const normalized = normalizeMemoryRelationActions([
    {
      ...createAction("x"),
      type: "memory.upsert",
      title: null,
      content: wrapped,
      kind: "fact",
      confidence: "high",
      silent: false,
    },
  ]);
  const parsed = parseActionFollowupRelation(normalized[0]!.content!);
  assert.ok(parsed);
  assert.equal(parsed?.trigger, "לנקות מקרר");
  assert.equal(selectLearnedActionRelations([
    {
      id: "33333333-3333-4333-8333-333333333333",
      kind: "fact",
      content: normalized[0]!.content!,
      confidence: "high",
      source: "user",
      seen_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ]).length, 1);
});

test("pending schedule strips plan and due patches on plan entities; keeps shopping", () => {
  const pending = {
    type: "schedule_plan" as const,
    date: "2026-09-15",
    saved: false,
    items: [
      {
        task_id: "11111111-1111-4111-8111-111111111111",
        title: "כביסה",
        status: "open" as const,
        planned_start: "14:00",
        planned_end: null,
        fixed: false,
      },
    ],
  };
  const actions: AgentAction[] = [
    {
      ...createAction("ignore"),
      type: "task.update",
      id: "11111111-1111-4111-8111-111111111111",
      title: "כביסה",
      due_patch: "set",
      due_on: "2026-09-15",
      due_time: "09:00",
    },
    {
      ...createAction("חלב"),
      type: "shopping.add",
      title: "חלב",
      quantity: 1,
    },
  ];
  const isolated = isolatePendingScheduleActions({
    actions,
    pendingSchedule: pending,
    tasks: [task({ id: "11111111-1111-4111-8111-111111111111", title: "כביסה" })],
  });
  assert.equal(isolated.strippedScheduleMutations, 1);
  assert.equal(isolated.actions[0]?.type, "shopping.add");
});

test("schedule draft remains pending without planned times", () => {
  const plan = {
    type: "schedule_plan" as const,
    date: "2026-09-15",
    saved: false,
    items: [
      {
        task_id: "11111111-1111-4111-8111-111111111111",
        title: "כביסה",
        status: "open" as const,
        planned_start: "14:00",
        planned_end: null,
        fixed: false,
      },
    ],
  };
  assert.equal(
    isScheduleDraftPending(plan, [
      task({ id: "11111111-1111-4111-8111-111111111111", title: "כביסה" }),
    ]),
    true,
  );
});

test("day bounds resolve from preference clocks", () => {
  const memories: MemoryRow[] = [
    {
      id: "44444444-4444-4444-8444-444444444444",
      kind: "preference",
      content: "יום העבודה שלי בדרך כלל 09:00 עד 18:30",
      confidence: "high",
      source: "user",
      seen_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ];
  const bounds = resolveDayBoundsFromMemory(memories);
  assert.equal(bounds.day_start, "09:00");
  assert.equal(bounds.day_end, "18:30");
});
