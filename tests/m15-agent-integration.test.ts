import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { composeReply, inspectActions } from "../lib/action-schema.ts";
import { reconcileActions } from "../lib/agent/reconcile.ts";
import type { TaskRow } from "../lib/types.ts";

const root = new URL("../", import.meta.url);
const taskId = "11111111-1111-4111-8111-111111111111";

function read(rel: string) {
  return readFileSync(new URL(rel, root), "utf8");
}

function task(title: string): TaskRow {
  return {
    id: taskId,
    title,
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
    created_at: "2026-09-30T00:00:00.000Z",
    updated_at: "2026-09-30T00:00:00.000Z",
    completed_at: null,
  };
}

test("M15 action schema exposes canonical task, reminder, plan, shopping, and checklist actions", () => {
  const types = read("lib/types.ts");
  for (const type of [
    "task.create",
    "task.update",
    "shopping.add",
    "shopping.update",
    "checklist.create",
    "checklist.item.toggle",
  ]) {
    assert.match(types, new RegExp(`"${type.replace(".", "\\.")}"`));
  }
  const schema = read("lib/action-schema.ts");
  assert.match(schema, /reminder_enabled/);
  assert.match(schema, /reminder_at_patch/);
  assert.match(schema, /plan_patch/);
});

test("M15 routes mutations through the existing idempotent domain boundary", () => {
  const executor = read("lib/agent/idempotent-actions.ts");
  const route = read("app/api/chat/route.ts");
  assert.match(executor, /executeAction\(db, input\.userId, action\)/);
  assert.match(executor, /rpc\("execute_lean_action_idempotent"/);
  assert.match(route, /executeIdempotentActions\(db/);
  const agentSources = [
    read("lib/agent/idempotent-actions.ts"),
    read("lib/agent/prepare-actions.ts"),
    read("lib/agent/reconcile.ts"),
    read("lib/agent/turn.ts"),
  ].join("\n");
  assert.doesNotMatch(agentSources, /\.from\("(?:tasks|shopping_items|checklists|day_plans)"\)\.(?:insert|update|delete)/);
  assert.doesNotMatch(agentSources, /replanDay\(/);
});

test("M15 rejects malformed actions before they can reach a mutation", () => {
  const inspected = inspectActions([{ type: "task.create", title: "" }]);
  assert.equal(inspected.accepted.length, 0);
  assert.equal(inspected.results.length, 1);
});

test("M15 never reports success for a failed action, and confirms only returned success", () => {
  const failed = composeReply("הוספתי את המשימה.", [
    { ok: false, type: "task.create", error: "שמירה נכשלה." },
  ]);
  assert.match(failed, /שמירה נכשלה/);
  assert.doesNotMatch(failed, /הוספתי/);

  const succeeded = composeReply("בוצע.", [
    { ok: true, type: "task.create", id: taskId, title: "לקנות חלב", due_on: null, due_time: null },
  ]);
  assert.match(succeeded, /שמרתי|הוספתי/);
});

test("M15 follow-up updates the existing task instead of creating a duplicate", () => {
  const reconciled = reconcileActions({
    openTasks: [task("כביסה")],
    userMessage: "בעצם בערב",
    actions: [
      {
        type: "task.update",
        id: null,
        title: "כביסה",
        notes: null,
        due_on: "2026-10-01",
        due_time: "19:00",
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
  });
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0]?.type, "task.update");
  assert.equal(reconciled[0]?.id, taskId);
});

test("M15 chat continuity loads the same session history and preserves turn idempotency", () => {
  const route = read("app/api/chat/route.ts");
  const receipts = read("lib/agent/turn-receipts.ts");
  assert.match(route, /session_id/);
  assert.match(route, /chat_messages/);
  assert.match(route, /\.limit\(compact\.historyLimit\)/);
  assert.match(route, /executeIdempotentActions/);
  assert.match(receipts, /turn_key/);
  assert.match(receipts, /status === "completed"/);
  assert.match(receipts, /turn_decision_conflict/);
});

test("M15 explicit schedule surface has no automatic Agent mutation", () => {
  const turn = read("lib/agent/turn.ts");
  assert.match(turn, /input\.surface === "schedule"/);
  assert.match(turn, /actions: \[\]/);
  assert.match(turn, /schedule_plan/);
});
