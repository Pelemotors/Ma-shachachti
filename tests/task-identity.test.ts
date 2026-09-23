import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findRelatedOpenTask,
  isExactOpenDuplicate,
  isRelatedTaskMention,
  isSameTaskEntity,
} from "../lib/task-identity.ts";
import { reconcileActions } from "../lib/agent/reconcile.ts";
import type { AgentAction, TaskRow } from "../lib/types.ts";

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

function createAction(title: string): AgentAction {
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
  };
}

test("WEEK-01 entity pairs resolve to the same open task", () => {
  assert.equal(isSameTaskEntity("צריך לקנות נעליים לתום", "הזמנתי לתום נעליים"), true);
  assert.equal(
    isRelatedTaskMention("תזכורת לקחת את החבילה מהלוקר", "כבר לקחתי את החבילה", {
      completion: true,
    }),
    true,
  );
  assert.equal(isSameTaskEntity("להתקשר לחשמלאי", "דיברתי עם החשמלאי"), true);
});

test("qualified extras stay different tasks on create", () => {
  assert.equal(isSameTaskEntity("לקנות חלב", "לקנות חלב לאמא"), false);
  assert.equal(
    isExactOpenDuplicate(
      { title: "לקנות חלב", notes: "", due_on: null, status: "open" },
      { title: "לקנות חלב לאמא", notes: "", due_on: null },
    ),
    false,
  );
});

test("completion utterance completes the same entity instead of creating", () => {
  const open = [task({ id: "shoe-1", title: "צריך לקנות נעליים לתום" })];
  const actions = reconcileActions({
    actions: [createAction("הזמנתי לתום נעליים")],
    openTasks: open,
    userMessage: "הזמנתי לתום נעליים",
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.type, "task.complete");
  assert.equal(actions[0]?.id, "shoe-1");
});

test("completion shopping action redirects to task.complete on related open task", () => {
  const open = [task({ id: "shoe-1", title: "לקנות נעליים חדשות לתום" })];
  const actions = reconcileActions({
    actions: [
      {
        ...createAction("נעליים לתום"),
        type: "shopping.update",
        id: "shop-1",
        title: "נעליים לתום",
      },
    ],
    openTasks: open,
    shopping: [
      {
        id: "shop-1",
        title: "נעליים לתום",
        quantity: 1,
        purchased_at: null,
        order_index: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    userMessage: "הזמנתי לתום נעליים",
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.type, "task.complete");
  assert.equal(actions[0]?.id, "shoe-1");
});

test("completion utterance forces task.complete even when shopping id is missing", () => {
  const open = [task({ id: "shoe-1", title: "לקנות נעליים לתום" })];
  const actions = reconcileActions({
    actions: [
      {
        ...createAction("נעליים"),
        type: "shopping.update",
        id: "missing-shop",
        title: null,
      },
    ],
    openTasks: open,
    shopping: [],
    userMessage: "הזמנתי לתום נעליים",
  });
  assert.ok(actions.every((action) => !String(action.type).startsWith("shopping.")));
  assert.equal(actions.some((action) => action.type === "task.complete" && action.id === "shoe-1"), true);
});

test("completion of shopping-only item toggles purchased when no open task", () => {
  const actions = reconcileActions({
    actions: [
      {
        ...createAction("נעליים"),
        type: "shopping.update",
        id: "shop-1",
        title: "לקנות נעליים לתום",
      },
    ],
    openTasks: [],
    shopping: [
      {
        id: "shop-1",
        title: "לקנות נעליים לתום",
        quantity: 1,
        purchased_at: null,
        order_index: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    userMessage: "הזמנתי לתום נעליים",
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.type, "shopping.toggle");
  assert.equal(actions[0]?.id, "shop-1");
  assert.equal(actions[0]?.purchased, true);
});

test("completion closes every related open duplicate", () => {
  const open = [
    task({ id: "pack-a", title: "לקחת חבילה מהלוקר" }),
    task({ id: "pack-b", title: "תזכורת לקחת את החבילה מהלוקר" }),
  ];
  const actions = reconcileActions({
    actions: [createAction("כבר לקחתי את החבילה")],
    openTasks: open,
    userMessage: "כבר לקחתי את החבילה",
  });
  assert.equal(actions.length, 2);
  assert.ok(actions.every((action) => action.type === "task.complete"));
  assert.deepEqual(
    actions.map((action) => action.id).sort(),
    ["pack-a", "pack-b"],
  );
});

test("timed due attaches a point day_plan patch", () => {
  const actions = reconcileActions({
    actions: [
      {
        ...createAction("רופא ילדים"),
        due_on: "2026-09-21",
        due_time: "17:00",
        due_patch: "set",
      },
    ],
    openTasks: [],
    userMessage: "מחר ב-17:00 רופא ילדים",
  });
  assert.equal(actions[0]?.type, "task.create");
  assert.equal(actions[0]?.plan_patch, "set");
  assert.equal(actions[0]?.planned_date, "2026-09-21");
  assert.equal(actions[0]?.planned_start_time, "17:00");
});

test("point reschedule of timed due updates day_plan start only for that entity", () => {
  const open = [task({ id: "doc-1", title: "רופא ילדים לתום", due_on: "2026-09-21" })];
  const actions = reconcileActions({
    actions: [
      {
        ...createAction("רופא ילדים"),
        type: "task.update",
        id: "doc-1",
        due_on: "2026-09-21",
        due_time: "18:00",
        due_patch: "set",
      },
    ],
    openTasks: open,
    userMessage: "תעבירי את הרופא לשש",
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.type, "task.update");
  assert.equal(actions[0]?.id, "doc-1");
  assert.equal(actions[0]?.plan_patch, "set");
  assert.equal(actions[0]?.planned_start_time, "18:00");
  assert.equal(actions[0]?.planned_date, "2026-09-21");
});

test("locker and electrician completion map to the open entity", () => {
  const open = [
    task({ id: "pack-1", title: "לקחת חבילה מהלוקר" }),
    task({ id: "elec-1", title: "להתקשר לחשמלאי" }),
  ];
  const pack = reconcileActions({
    actions: [createAction("כבר לקחתי את החבילה")],
    openTasks: open,
    userMessage: "כבר לקחתי את החבילה",
  });
  assert.equal(pack[0]?.type, "task.complete");
  assert.equal(pack[0]?.id, "pack-1");

  const elec = reconcileActions({
    actions: [createAction("דיברתי עם החשמלאי")],
    openTasks: open,
    userMessage: "דיברתי עם החשמלאי",
  });
  assert.equal(elec[0]?.type, "task.complete");
  assert.equal(elec[0]?.id, "elec-1");
});

test("complete without id still binds the related open task", () => {
  const open = [task({ id: "pack-1", title: "לקחת חבילה מהלוקר" })];
  const actions = reconcileActions({
    actions: [{ ...createAction("החבילה"), type: "task.complete", title: null }],
    openTasks: open,
    userMessage: "כבר לקחתי את החבילה",
  });
  assert.equal(actions[0]?.type, "task.complete");
  assert.equal(actions[0]?.id, "pack-1");
});

test("findRelatedOpenTask ignores cancelled and done rows", () => {
  const rows = [
    task({ id: "old", title: "להתקשר לחשמלאי", status: "done" }),
    task({ id: "open", title: "להתקשר לחשמלאי" }),
  ];
  assert.equal(findRelatedOpenTask(rows, "דיברתי עם החשמלאי")?.id, "open");
});
