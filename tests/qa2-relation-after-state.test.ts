import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareExecutableActions } from "../lib/agent/prepare-actions.ts";
import {
  encodeActionFollowupRelation,
  selectLearnedActionRelations,
} from "../lib/agent/learned-relations.ts";
import type { AgentAction, MemoryRow, TaskRow } from "../lib/types.ts";

function memory(
  id: string,
  trigger: string,
  followup: string,
  updatedAt: string,
): MemoryRow {
  return {
    id,
    kind: "preference",
    content: encodeActionFollowupRelation({ trigger, followup }),
    confidence: "high",
    source: "user",
    seen_at: null,
    created_at: updatedAt,
    updated_at: updatedAt,
  };
}

function create(title: string): AgentAction {
  return {
    type: "task.create",
    id: null,
    title,
    notes: null,
    due_on: "2026-09-16",
    due_time: null,
    due_patch: "set",
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
  };
}

test("QA-2 regression: laundry exception works with preexisting fridge relation", () => {
  const memories = [
    memory(
      "11111111-1111-4111-8111-111111111111",
      "לנקות את המקרר",
      "לזרוק זבל",
      "2026-09-15T10:00:00.000Z",
    ),
    memory(
      "22222222-2222-4222-8222-222222222222",
      "כביסה",
      "קיפול ופיזור",
      "2026-09-15T11:00:00.000Z",
    ),
  ];
  const relations = selectLearnedActionRelations(memories);
  assert.equal(relations.length, 2);

  const prepared = prepareExecutableActions({
    actions: [create("כביסה"), create("קיפול ופיזור")],
    openTasks: [] as TaskRow[],
    memories,
    turnFlags: {
      suppress_learned_followups: true,
      standing_rule_change: false,
    },
    userMessage: "מחר כביסה אבל הפעם בלי קיפול ופיזור",
  });
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0]?.title, "כביסה");
});

test("QA-2 regression: teach laundry after fridge does not drop fridge relation", () => {
  const memories = [
    memory(
      "11111111-1111-4111-8111-111111111111",
      "לנקות את המקרר",
      "לזרוק זבל",
      "2026-09-15T10:00:00.000Z",
    ),
  ];
  const prepared = prepareExecutableActions({
    actions: [],
    openTasks: [],
    memories,
    userMessage:
      "כשאני אומרת כביסה יש גם קיפול ופיזור. שמרי כ־action_followup JSON.",
  });
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0]?.type, "memory.upsert");
  assert.match(String(prepared[0]?.content), /כביסה/);
  // Existing fridge memory still selectable alongside new write.
  const next = selectLearnedActionRelations([
    ...memories,
    memory(
      "33333333-3333-4333-8333-333333333333",
      "כביסה",
      "קיפול ופיזור",
      "2026-09-15T12:00:00.000Z",
    ),
  ]);
  assert.equal(next.length, 2);
});

test("duplicate trigger memories collapse to newest", () => {
  const memories = [
    memory(
      "11111111-1111-4111-8111-111111111111",
      "כביסה",
      "קיפול ישן",
      "2026-09-15T10:00:00.000Z",
    ),
    memory(
      "22222222-2222-4222-8222-222222222222",
      "כביסה",
      "קיפול ופיזור",
      "2026-09-15T12:00:00.000Z",
    ),
  ];
  const relations = selectLearnedActionRelations(memories);
  assert.equal(relations.length, 1);
  assert.equal(relations[0]?.followupTitle, "קיפול ופיזור");
});

test("ensureRelationUpsertAction rewrites English model JSON to user teaching language", async () => {
  const { ensureRelationUpsertAction, parseActionFollowupRelation } = await import(
    "../lib/agent/learned-relations.ts"
  );
  const actions = ensureRelationUpsertAction({
    actions: [],
    proposalActions: [
      {
        type: "memory.upsert",
        id: null,
        title: null,
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
        kind: "preference",
        content:
          '{"v":1,"kind":"action_followup","trigger":"Clean the fridge","followup":"Throw out the trash","ordering":"after","scope":"always","active":true}',
        confidence: "high",
        silent: true,
      },
    ],
    userMessage:
      "כשאני אומרת לנקות את המקרר תוסיף אחריו לזרוק זבל. שמרי כ־action_followup JSON.",
  });
  const parsed = parseActionFollowupRelation(actions[0]!.content!);
  assert.ok(parsed);
  assert.match(parsed!.trigger, /מקרר/);
  assert.match(parsed!.followupTitle, /זבל/);
});
