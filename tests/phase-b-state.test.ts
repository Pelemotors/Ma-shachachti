import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expandLearnedFollowUps,
  filterMemoryWritesForException,
  isOneShotException,
  reconcileActions,
} from "../lib/agent/reconcile.ts";
import {
  encodeActionFollowupRelation,
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
  assert.equal(actions[0]?.notes, "בלי קיפול");
});

test("reconcile collapses duplicate creates in one batch", () => {
  const actions = reconcileActions({
    actions: [createAction("חלב"), createAction("חלב")],
    openTasks: [],
  });
  assert.equal(actions.length, 1);
});

test("one-shot exception detected without domain keywords", () => {
  assert.equal(isOneShotException("מחר כביסה אבל הפעם בלי קיפול ופיזור"), true);
  assert.equal(isOneShotException("מחר כביסה כרגיל"), false);
});

test("learned follow-up expands on trigger and skips on one-shot exception", () => {
  const relations = [
    { trigger: "לנקות מקרר", followupTitle: "לזרוק זבל", ordering: "after" as const },
  ];
  const expanded = expandLearnedFollowUps({
    actions: [createAction("לנקות מקרר מחר")],
    relations,
    openTasks: [],
    userMessage: "אני צריכה לנקות מקרר מחר",
  });
  assert.equal(expanded.length, 2);
  assert.equal(expanded[1]?.title, "לזרוק זבל");

  const skipped = expandLearnedFollowUps({
    actions: [createAction("לנקות מקרר")],
    relations,
    openTasks: [],
    userMessage: "ביום שישי לנקות מקרר אבל בלי לזרוק זבל הפעם",
  });
  assert.equal(skipped.length, 1);
});

test("one-shot exception does not write standing preference memory", () => {
  const filtered = filterMemoryWritesForException({
    userMessage: "הפעם בלי קיפול",
    actions: [
      {
        ...createAction("x"),
        type: "memory.upsert",
        title: null,
        content: "כביסה בלי קיפול תמיד",
        kind: "preference",
        confidence: "high",
        silent: false,
      },
    ],
  });
  assert.equal(filtered.length, 0);
});

test("action follow-up relation encode/parse roundtrip", () => {
  const encoded = encodeActionFollowupRelation({
    trigger: "לנקות מקרר",
    followup: "לזרוק זבל",
  });
  const parsed = parseActionFollowupRelation(encoded);
  assert.ok(parsed);
  assert.equal(parsed?.trigger, "לנקות מקרר");
  assert.equal(parsed?.followupTitle, "לזרוק זבל");
  const memories: MemoryRow[] = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      kind: "fact",
      content: encoded,
      confidence: "high",
      source: "user",
      seen_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ];
  assert.equal(selectLearnedActionRelations(memories).length, 1);
});

test("pending schedule strips plan mutations but keeps shopping", () => {
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
      plan_patch: "set",
      planned_date: "2026-09-15",
      planned_start_time: "09:00",
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
  assert.equal(isolated.actions.length, 1);
  assert.equal(isolated.actions[0]?.type, "shopping.add");
});

test("schedule draft no longer pending once planned times committed", () => {
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

test("day bounds resolve from preference clocks not domain words", () => {
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
  assert.equal(bounds.source, "memory");
});
