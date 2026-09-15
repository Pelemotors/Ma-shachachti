import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { prepareExecutableActions } from "../lib/agent/prepare-actions.ts";
import { encodeActionFollowupRelation } from "../lib/agent/learned-relations.ts";
import type { AgentAction, MemoryRow, TaskRow } from "../lib/types.ts";

function createAction(title: string): AgentAction {
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
  };
}

test("prepareExecutableActions expands follow-ups for persistence before RPC", () => {
  const memories: MemoryRow[] = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      kind: "fact",
      content: encodeActionFollowupRelation({
        trigger: "לנקות מקרר",
        followup: "לזרוק זבל",
      }),
      confidence: "high",
      source: "user",
      seen_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ];
  const prepared = prepareExecutableActions({
    actions: [createAction("לנקות מקרר")],
    openTasks: [] as TaskRow[],
    memories,
    turnFlags: {
      suppress_learned_followups: false,
      standing_rule_change: false,
    },
  });
  assert.equal(prepared.length, 2);
  assert.equal(prepared[1]?.title, "לזרוק זבל");
});

test("chat route prepares actions before the single decision save", () => {
  const route = readFileSync(
    fileURLToPath(new URL("../app/api/chat/route.ts", import.meta.url)),
    "utf8",
  );
  const prepareIdx = route.indexOf("prepareExecutableActions");
  const saveIdx = route.indexOf("saveAgentTurnDecision", prepareIdx);
  const execIdx = route.indexOf("executeIdempotentActions", saveIdx);
  assert.ok(prepareIdx > 0 && saveIdx > prepareIdx && execIdx > saveIdx);
  // Must not attempt a second decision save after execute prep (conflict).
  const secondSave = route.indexOf("saveAgentTurnDecision", saveIdx + 1);
  assert.ok(secondSave < 0 || secondSave > execIdx === false);
  assert.equal(
    (route.match(/saveAgentTurnDecision/g) || []).length,
    2, // import + one call site
  );
});

test("shopping.add without quantity defaults to 1 via inspectActions", async () => {
  const { inspectActions } = await import("../lib/action-schema.ts");
  const inspected = inspectActions([
    {
      type: "shopping.add",
      title: "חלב",
      quantity: null,
      id: null,
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
    },
  ]);
  assert.equal(inspected.results.length, 0);
  assert.equal(inspected.accepted[0]?.quantity, 1);
});

test("ensureRelationUpsertAction synthesizes JSON when user asked for action_followup", async () => {
  const { ensureRelationUpsertAction, parseActionFollowupRelation } = await import(
    "../lib/agent/learned-relations.ts"
  );
  const actions = ensureRelationUpsertAction({
    actions: [],
    userMessage:
      "כשאני אומרת לנקות את המקרר תוסיף אחריו לזרוק זבל. שמרי כ־action_followup JSON.",
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.type, "memory.upsert");
  const parsed = parseActionFollowupRelation(actions[0]!.content!);
  assert.ok(parsed);
  assert.match(parsed!.trigger, /מקרר/);
  assert.match(parsed!.followupTitle, /זבל/);
});

test("filterMemoryWritesForException keeps teach writes when action_followup requested", async () => {
  const { prepareExecutableActions } = await import("../lib/agent/prepare-actions.ts");
  const prepared = prepareExecutableActions({
    actions: [],
    openTasks: [],
    memories: [],
    turnFlags: {
      suppress_learned_followups: true,
      standing_rule_change: false,
    },
    userMessage:
      "כשאני אומרת לנקות את המקרר תוסיף אחריו לזרוק זבל. שמרי כ־action_followup JSON.",
  });
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0]?.type, "memory.upsert");
});

test("promoteRelationWritesFromProposal lifts action_followup out of proposal", async () => {
  const { promoteRelationWritesFromProposal } = await import(
    "../lib/agent/learned-relations.ts"
  );
  const promoted = promoteRelationWritesFromProposal({
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
          '{"v":1,"kind":"action_followup","trigger":"A","followup":"B","ordering":"after","scope":"always","active":true}',
        confidence: "high",
        silent: true,
      },
    ],
  });
  assert.equal(promoted.promoted, 1);
  assert.equal(promoted.actions[0]?.type, "memory.upsert");
});

test("resolveSuppressFlags ignores misfired suppress without followup mention", async () => {
  const { resolveSuppressFlags, prepareExecutableActions } = await import(
    "../lib/agent/prepare-actions.ts"
  );
  const { encodeActionFollowupRelation } = await import(
    "../lib/agent/learned-relations.ts"
  );
  const flags = resolveSuppressFlags({
    turnFlags: {
      suppress_learned_followups: true,
      standing_rule_change: false,
    },
    userMessage: "ביום ראשון לנקות מקרר",
    relations: [{ followupTitle: "לזרוק זבל" }],
  });
  assert.equal(flags.suppress_learned_followups, false);

  const prepared = prepareExecutableActions({
    actions: [
      {
        type: "task.create",
        id: null,
        title: "לנקות מקרר",
        notes: null,
        due_on: "2026-09-17",
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
      },
    ],
    openTasks: [],
    memories: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        kind: "preference",
        content: encodeActionFollowupRelation({
          trigger: "לנקות את המקרר",
          followup: "לזרוק זבל",
        }),
        confidence: "high",
        source: "user",
        seen_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    turnFlags: {
      suppress_learned_followups: true,
      standing_rule_change: false,
    },
    userMessage: "ביום ראשון לנקות מקרר",
  });
  assert.equal(prepared.length, 2);
  assert.equal(prepared[1]?.title, "לזרוק זבל");
});

test("filterFollowupCreatesForException strips model-emitted followup creates", async () => {
  const { prepareExecutableActions } = await import("../lib/agent/prepare-actions.ts");
  const { encodeActionFollowupRelation } = await import(
    "../lib/agent/learned-relations.ts"
  );
  const prepared = prepareExecutableActions({
    actions: [
      {
        type: "task.create",
        id: null,
        title: "כביסה",
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
      },
      {
        type: "task.create",
        id: null,
        title: "קיפול ופיזור",
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
      },
    ],
    openTasks: [],
    memories: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        kind: "preference",
        content: encodeActionFollowupRelation({
          trigger: "כביסה",
          followup: "קיפול ופיזור",
        }),
        confidence: "high",
        source: "user",
        seen_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    turnFlags: {
      suppress_learned_followups: true,
      standing_rule_change: false,
    },
    userMessage: "מחר כביסה אבל הפעם בלי קיפול ופיזור",
  });
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0]?.title, "כביסה");
});
