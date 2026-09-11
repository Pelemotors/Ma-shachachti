import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENT_TURN_JSON_SCHEMA, parseDecision } from "../lib/action-schema.ts";
import { resolveTaskListPresentation } from "../lib/presentation.ts";
import type { TaskRow } from "../lib/types.ts";

const ownId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const missingId = "33333333-3333-4333-8333-333333333333";

const ownTask: TaskRow = {
  id: ownId,
  title: "יום הורים לפלא",
  notes: "",
  status: "open",
  due_on: "2026-10-23",
  due_at: "2026-10-23T14:00:00.000Z",
  reminder_offset_minutes: null,
  reminder_enabled: true,
  reminder_sent_at: null,
  reminder_claimed_at: null,
  planned_start_at: null,
  planned_end_at: null,
  reschedule_count: 0,
  last_rescheduled_at: null,
  created_at: "2026-09-10T00:00:00.000Z",
  updated_at: "2026-09-10T00:00:00.000Z",
  completed_at: null,
};

test("presentation null is accepted", () => {
  const parsed = parseDecision(
    JSON.stringify({
      reply: "אין רשימה להציג.",
      actions: [],
      presentation: null,
      consequence_updates: [],
    }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.presentation, null);
    assert.deepEqual(parsed.consequence_updates, []);
  }
  assert.equal(resolveTaskListPresentation(null, [ownTask]), null);
});

test("task_list with valid ids is accepted", () => {
  const parsed = parseDecision(
    JSON.stringify({
      reply: "אלה המשימות הפתוחות שלך כרגע:",
      actions: [],
      presentation: { type: "task_list", task_ids: [ownId] },
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.presentation, {
    type: "task_list",
    task_ids: [ownId],
  });
  const resolved = resolveTaskListPresentation(parsed.presentation, [ownTask]);
  assert.deepEqual(resolved, {
    type: "task_list",
    tasks: [
      {
        id: ownId,
        title: "יום הורים לפלא",
        notes: "",
        status: "open",
        due_on: "2026-10-23",
        due_at: "2026-10-23T14:00:00.000Z",
      },
    ],
  });
});

test("invalid task id is dropped", () => {
  const resolved = resolveTaskListPresentation(
    { type: "task_list", task_ids: ["not-a-uuid", ownId] },
    [ownTask],
  );
  assert.equal(resolved?.tasks.length, 1);
  assert.equal(resolved?.tasks[0]?.id, ownId);
});

test("task id that does not belong to the user is not returned", () => {
  const resolved = resolveTaskListPresentation(
    { type: "task_list", task_ids: [otherId, missingId] },
    [ownTask],
  );
  assert.equal(resolved, null);
});

test("the model cannot set title or date itself", () => {
  const resolved = resolveTaskListPresentation(
    {
      type: "task_list",
      task_ids: [ownId],
      title: "כותרת מזויפת",
      due_on: "1999-01-01",
      tasks: [
        {
          id: ownId,
          title: "כותרת מזויפת",
          due_on: "1999-01-01",
          notes: "המצאה",
          status: "done",
        },
      ],
    },
    [ownTask],
  );
  assert.equal(resolved?.tasks[0]?.title, "יום הורים לפלא");
  assert.equal(resolved?.tasks[0]?.due_on, "2026-10-23");
  assert.equal(resolved?.tasks[0]?.notes, "");
  assert.equal(resolved?.tasks[0]?.status, "open");
});

test("task_list uses real task rows from source of truth", () => {
  const resolved = resolveTaskListPresentation(
    { type: "task_list", task_ids: [ownId] },
    [ownTask],
  );
  assert.equal(resolved?.tasks[0]?.title, ownTask.title);
  assert.equal(resolved?.tasks[0]?.due_on, ownTask.due_on);
});

test("actions and presentation can appear in the same turn", () => {
  const parsed = parseDecision(
    JSON.stringify({
      reply: "אבקש לשמור ואז להציג.",
      actions: [
        {
          type: "task.create",
          id: null,
          title: "לקנות חלב",
          notes: null,
          due_on: null,
          kind: null,
          content: null,
          confidence: null,
        },
      ],
      presentation: { type: "task_list", task_ids: [ownId] },
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.actions.length, 1);
  assert.equal((parsed.actions[0] as { type?: string }).type, "task.create");
  assert.equal(parsed.presentation?.type, "task_list");
});

test("unknown presentation types fail the decision before execution", () => {
  const parsed = parseDecision(
    JSON.stringify({
      reply: "ספר לי מה אתה יודע על הבית",
      actions: [],
      presentation: { type: "cards", task_ids: [ownId] },
    }),
  );
  assert.equal(parsed.ok, false);
});

test("agent turn schema requires proposal and presentation", () => {
  assert.deepEqual(AGENT_TURN_JSON_SCHEMA.required, [
    "reply",
    "actions",
    "proposal",
    "presentation",
    "consequence_updates",
  ]);
});
