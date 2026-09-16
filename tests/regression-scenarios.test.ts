/**
 * Regression fixtures for the 11 user-reported failures (Scenarios A–K).
 * These are deterministic unit/integration-style checks over runtime contracts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { composeReply } from "../lib/action-schema.ts";
import {
  expandLearnedFollowUps,
  filterMemoryWritesForException,
  reconcileActions,
} from "../lib/agent/reconcile.ts";
import {
  encodeActionFollowupRelation,
  selectLearnedActionRelations,
} from "../lib/agent/learned-relations.ts";
import {
  isolatePendingScheduleActions,
} from "../lib/agent/schedule-isolation.ts";
import {
  rankTaskCandidates,
  stabilizeForgottenSelection,
} from "../lib/agent/candidate-rank.ts";
import { buildCompactContext } from "../lib/agent/context/compact.ts";
import { ensureUserReply, DEEP_CHECK_FALLBACK_REPLY } from "../lib/agent/surface-fallback.ts";
import type { AgentAction, MemoryRow, TaskRow } from "../lib/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function task(
  partial: Partial<TaskRow> & { id: string; title: string },
): TaskRow {
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
    due_on: null,
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

test("Scenario A — shopping confirmation is a single concise line", () => {
  const reply = composeReply("מעולה שמרתי לך ואם תרצי נוסיף עוד דברים לרשימה", [
    { ok: true, type: "shopping.add", title: "חלב" },
  ]);
  assert.match(reply, /חלב/);
  assert.equal(reply.split("\n").length, 1);
  assert.doesNotMatch(reply, /מעולה|נוסיף עוד/);
});

test("Scenario B — one-shot exception skips follow-up and keeps general preference", () => {
  const relationContent = encodeActionFollowupRelation({
    trigger: "כביסה",
    followup: "קיפול ופיזור",
  });
  const memories: MemoryRow[] = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      kind: "fact",
      content: relationContent,
      confidence: "high",
      source: "user",
      seen_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ];
  assert.equal(selectLearnedActionRelations(memories).length, 1);

  const exceptionTurn = expandLearnedFollowUps({
    actions: [createAction("כביסה", { due_on: "2026-09-16" })],
    relations: selectLearnedActionRelations(memories).map((row) => ({
      trigger: row.trigger,
      followupTitle: row.followupTitle,
      ordering: row.ordering,
    })),
    openTasks: [],
    turnFlags: { suppress_learned_followups: true, standing_rule_change: false },
  });
  assert.equal(exceptionTurn.length, 1);
  assert.equal(
    filterMemoryWritesForException({
      turnFlags: { suppress_learned_followups: true, standing_rule_change: false },
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
    }).length,
    0,
  );

  const later = expandLearnedFollowUps({
    actions: [createAction("כביסה", { due_on: "2026-09-20" })],
    relations: selectLearnedActionRelations(memories).map((row) => ({
      trigger: row.trigger,
      followupTitle: row.followupTitle,
      ordering: row.ordering,
    })),
    openTasks: [],
    turnFlags: { suppress_learned_followups: false, standing_rule_change: false },
  });
  assert.equal(later.length, 2);
});

test("Scenario C — learned fridge→trash follow-up with exception then restore", () => {
  const relations = [
    {
      trigger: "לנקות מקרר",
      followupTitle: "לזרוק זבל",
      ordering: "after" as const,
    },
  ];
  const first = expandLearnedFollowUps({
    actions: [createAction("לנקות מקרר", { due_on: "2026-09-16" })],
    relations,
    openTasks: [],
    turnFlags: { suppress_learned_followups: false, standing_rule_change: false },
  });
  assert.equal(first.length, 2);

  const exception = expandLearnedFollowUps({
    actions: [createAction("לנקות מקרר", { due_on: "2026-09-18" })],
    relations,
    openTasks: [],
    turnFlags: { suppress_learned_followups: true, standing_rule_change: false },
  });
  assert.equal(exception.length, 1);

  const restored = expandLearnedFollowUps({
    actions: [createAction("לנקות מקרר", { due_on: "2026-09-20" })],
    relations,
    openTasks: [],
    turnFlags: { suppress_learned_followups: false, standing_rule_change: false },
  });
  assert.equal(restored.length, 2);
  assert.equal(restored[1]?.title, "לזרוק זבל");
});

test("Scenario D — corrections reconcile to one entity", () => {
  const open = [
    task({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "משימה" }),
  ];
  const first = reconcileActions({
    actions: [createAction("משימה", { due_on: "2026-09-16", due_time: "10:00" })],
    openTasks: open,
  });
  assert.equal(first[0]?.type, "task.update");
  const second = reconcileActions({
    actions: [
      createAction("משימה", { due_on: "2026-09-16", due_time: "11:30", title: "משימה מעודכנת" }),
    ],
    openTasks: open,
  });
  assert.equal(second.length, 1);
  assert.equal(second[0]?.type, "task.update");
  assert.equal(second[0]?.id, open[0]?.id);
});

test("Scenario E — pending schedule strips plan mutations; shopping still works", () => {
  const isolated = isolatePendingScheduleActions({
    actions: [
      {
        ...createAction("x"),
        type: "task.update",
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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
    ],
    pendingSchedule: {
      type: "schedule_plan",
      date: "2026-09-15",
      saved: false,
      items: [
        {
          task_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          title: "כביסה",
          status: "open",
          planned_start: "14:00",
          planned_end: null,
          fixed: false,
        },
      ],
    },
    tasks: [task({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "כביסה" })],
  });
  assert.equal(isolated.strippedScheduleMutations, 1);
  assert.equal(isolated.actions[0]?.type, "shopping.add");
});

test("Scenario F — schedule candidates include undated important + routine", () => {
  const ctx = buildCompactContext({
    surface: "schedule",
    surfaceContext: {
      type: "schedule",
      date: "2026-09-15",
      day_start: "08:00",
      day_end: "22:00",
    },
    profile: null,
    currentTime: "13:40",
    queryHint: "",
    allTasks: [
      task({
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        title: "לקבוע תור",
        created_at: "2026-01-01T00:00:00.000Z",
        reschedule_count: 2,
      }),
      task({
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        title: "ניקיון",
        due_on: "2026-09-15",
        created_at: "2026-09-14T00:00:00.000Z",
      }),
    ],
    allMemory: [],
    consequences: [],
    shopping: [],
    checklists: [],
  });
  assert.equal(ctx.tasks.length, 2);
});

test("Scenario G — free-time keeps older important task in candidates", () => {
  const old = task({
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    title: "ישן חשוב",
    created_at: "2025-06-01T00:00:00.000Z",
    reschedule_count: 4,
  });
  const chores = Array.from({ length: 40 }, (_, i) =>
    task({
      id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
      title: `חדש ${i}`,
      created_at: new Date(Date.UTC(2026, 8, 15, 12, i)).toISOString(),
    }),
  );
  const ctx = buildCompactContext({
    surface: "free-time",
    surfaceContext: { type: "free-time", minutes: 30, effort: null },
    profile: null,
    currentTime: "13:40",
    queryHint: "",
    allTasks: [...chores, old],
    allMemory: [],
    consequences: [
      {
        task_id: old.id,
        user_id: "u",
        severity: "high",
        reason: "x",
        confidence: "high",
        basis: { kind: "explicit" },
        valid_until: null,
        created_at: old.created_at,
        updated_at: old.created_at,
      },
    ],
    shopping: [],
    checklists: [],
  });
  assert.ok(ctx.tasks.some((row) => row.id === old.id));
});

test("Scenario H — forgotten same revision is stable core set", () => {
  const ranked = rankTaskCandidates({
    tasks: Array.from({ length: 12 }, (_, i) =>
      task({
        id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
        title: `t${i}`,
        created_at: `2026-0${(i % 8) + 1}-01T00:00:00.000Z`,
        reschedule_count: i,
      }),
    ),
    now: new Date("2026-09-15T10:00:00.000Z"),
  });
  const a = stabilizeForgottenSelection({
    selectedIds: ranked.slice(2, 5).map((row) => row.task.id),
    ranked,
  });
  const b = stabilizeForgottenSelection({
    selectedIds: ranked.slice(2, 5).map((row) => row.task.id),
    ranked,
  });
  assert.deepEqual(a, b);
  assert.ok(a.length >= 5 && a.length <= 6);
});

test("Scenario I — deep-check empty output gets fallback not empty/502 path", () => {
  const reply = ensureUserReply({
    reply: "",
    surface: "deep-check",
    presentation: null,
  });
  assert.equal(reply, DEEP_CHECK_FALLBACK_REPLY);
  const route = readFileSync(join(root, "app/api/chat/route.ts"), "utf8");
  assert.match(route, /DEEP_CHECK_FALLBACK_REPLY/);
  assert.match(route, /ensureUserReply/);
});

test("Scenario J — brain-dump uses shopping context and soft-fail taxonomy", () => {
  const brain = readFileSync(join(root, "lib/agent/brain-dump.ts"), "utf8");
  assert.match(brain, /purpose: "brain-dump"/);
  assert.match(brain, /partial_success|failure_category/);
  assert.match(brain, /התמלול נשמר/);
  const ctx = buildCompactContext({
    surface: null,
    surfaceContext: null,
    profile: null,
    currentTime: "10:00",
    queryHint: "חלב",
    allTasks: [],
    allMemory: [],
    consequences: [],
    shopping: [
      {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        title: "לחם",
        quantity: 1,
        purchased_at: null,
        order_index: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    checklists: [],
    purpose: "brain-dump",
  });
  assert.equal(ctx.shopping.length, 1);
});

test("Scenario K — chat voice auto-send with draft preserve on failure", () => {
  const chat = readFileSync(join(root, "components/chat-app.tsx"), "utf8");
  assert.match(chat, /sendVoiceTranscript/);
  assert.match(chat, /voiceSendLock/);
  assert.match(chat, /voiceSentRecordingIds/);
});
