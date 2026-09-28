import assert from "node:assert/strict";
import { test } from "node:test";
import { executeAction } from "../lib/actions.ts";
import { resolveTaskDeadline } from "../lib/time.ts";
import type { AgentAction } from "../lib/types.ts";

function action(partial: Partial<AgentAction>): AgentAction {
  return {
    type: "task.create",
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
    silent: null,
    kind: null,
    content: null,
    confidence: null,
    ...partial,
  };
}

type Row = {
  id: string;
  user_id: string;
  title: string;
  notes: string;
  due_on: string | null;
  due_at: string | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
  reminder_at: string | null;
  reminder_enabled: boolean;
  reminder_offset_minutes: number | null;
  reminder_sent_at: string | null;
  reminder_claimed_at: string | null;
  status: string;
  completed_at: string | null;
};

/**
 * Minimal Supabase stub: tasks table + no-op day_plan paths.
 * M2 cares that planned_* lands on the Task row separately from due_*.
 */
function dbWith(rows: Row[]) {
  const dayPlans: Array<{ id: string; plan_date: string }> = [];
  const dayItems: Array<Record<string, unknown>> = [];
  const db = {
    from(table: string) {
      let filters: Record<string, string> = {};
      let payload: Record<string, unknown> = {};
      let op: "select" | "insert" | "update" | "delete" = "select";
      const api: Record<string, unknown> = {
        select() {
          return api;
        },
        eq(column: string, value: string) {
          filters[column] = value;
          return api;
        },
        neq() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        delete() {
          op = "delete";
          return api;
        },
        insert(next: Record<string, unknown> | Record<string, unknown>[]) {
          op = "insert";
          if (table === "tasks") {
            const row = next as Record<string, unknown>;
            payload = row;
            const created: Row = {
              id: `new-${rows.length + 1}`,
              user_id: String(row.user_id),
              title: String(row.title),
              notes: String(row.notes ?? ""),
              due_on: (row.due_on as string | null) ?? null,
              due_at: (row.due_at as string | null) ?? null,
              planned_start_at: (row.planned_start_at as string | null) ?? null,
              planned_end_at: (row.planned_end_at as string | null) ?? null,
              reminder_at: (row.reminder_at as string | null) ?? null,
              reminder_enabled: row.reminder_enabled === true,
              reminder_offset_minutes: (row.reminder_offset_minutes as number | null) ?? null,
              reminder_sent_at: null,
              reminder_claimed_at: null,
              status: "open",
              completed_at: null,
            };
            rows.push(created);
            api.created = created;
          } else if (table === "day_plans") {
            const row = (Array.isArray(next) ? next[0] : next) as Record<string, unknown>;
            const plan = {
              id: `plan-${dayPlans.length + 1}`,
              plan_date: String(row.plan_date),
            };
            dayPlans.push(plan);
            api.created = plan;
          } else if (table === "day_plan_items") {
            const list = Array.isArray(next) ? next : [next];
            dayItems.push(...list);
          }
          return api;
        },
        update(next: Record<string, unknown>) {
          op = "update";
          payload = next;
          return api;
        },
        created: undefined as unknown,
        async single() {
          return { data: api.created ?? { id: "x" }, error: null };
        },
        async maybeSingle() {
          if (table === "day_plans") {
            const found = dayPlans.find((plan) => plan.plan_date === filters.plan_date);
            return { data: found ?? null, error: null };
          }
          const found = rows.find(
            (row) => row.id === filters.id && row.user_id === filters.user_id,
          );
          return { data: found ?? null, error: null };
        },
        then(
          resolve: (value: { data: unknown; error: null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          if (table !== "tasks") {
            if (op === "delete") {
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            }
            if (op === "select") {
              return Promise.resolve({ data: [], error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
          if (op === "update") {
            const found = rows.find(
              (row) => row.id === filters.id && row.user_id === filters.user_id,
            );
            if (found) Object.assign(found, payload);
            return Promise.resolve({ data: found ? [found] : [], error: null }).then(
              resolve,
              reject,
            );
          }
          const data = rows.filter((row) => row.status !== "cancelled");
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return db as never;
}

test("M2: create with plan_patch stores planned_* without changing due_*", async () => {
  const rows: Row[] = [];
  const result = await executeAction(
    dbWith(rows),
    "user-1",
    action({
      title: "לקנות חלב",
      due_on: "2026-10-01",
      plan_patch: "set",
      planned_date: "2026-09-29",
      planned_start_time: "09:30",
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(rows[0]?.due_on, "2026-10-01");
  assert.equal(rows[0]?.due_at, null);
  assert.ok(rows[0]?.planned_start_at);
  const expected = resolveTaskDeadline("2026-09-29", "09:30");
  // planned uses same Jerusalem conversion helpers as deadline clock, but different fields
  assert.equal(expected.ok, true);
  if (expected.ok) {
    // planned start equals jerusalemDateTimeToUtc of planned date/time — same as due_at would be for that clock
    assert.equal(rows[0]?.planned_start_at, expected.due_at);
  }
  assert.notEqual(rows[0]?.due_on, "2026-09-29");
});

test("M2: updating plan_patch does not clear deadline; clearing plan keeps due", async () => {
  const rows: Row[] = [
    {
      id: "t1",
      user_id: "user-1",
      title: "לתקן ברז",
      notes: "",
      due_on: "2026-10-05",
      due_at: null,
      planned_start_at: null,
      planned_end_at: null,
      reminder_at: null,
      reminder_enabled: false,
      reminder_offset_minutes: null,
      reminder_sent_at: null,
      reminder_claimed_at: null,
      status: "open",
      completed_at: null,
    },
  ];
  const setPlan = await executeAction(
    dbWith(rows),
    "user-1",
    action({
      type: "task.update",
      id: "t1",
      plan_patch: "set",
      planned_date: "2026-09-30",
      planned_start_time: "18:00",
    }),
  );
  assert.equal(setPlan.ok, true);
  assert.equal(rows[0]?.due_on, "2026-10-05");
  assert.ok(rows[0]?.planned_start_at);

  const clearPlan = await executeAction(
    dbWith(rows),
    "user-1",
    action({
      type: "task.update",
      id: "t1",
      plan_patch: "clear",
      planned_date: "2026-09-30",
    }),
  );
  assert.equal(clearPlan.ok, true);
  assert.equal(rows[0]?.due_on, "2026-10-05");
  assert.equal(rows[0]?.planned_start_at, null);
  assert.equal(rows[0]?.planned_end_at, null);
});

test("M2: complete and reopen persist status without losing deadline or notes", async () => {
  const rows: Row[] = [
    {
      id: "t2",
      user_id: "user-1",
      title: "לסדר תיק",
      notes: "מגבונים",
      due_on: "2026-10-02",
      due_at: null,
      planned_start_at: null,
      planned_end_at: null,
      reminder_at: null,
      reminder_enabled: false,
      reminder_offset_minutes: null,
      reminder_sent_at: null,
      reminder_claimed_at: null,
      status: "open",
      completed_at: null,
    },
  ];
  const done = await executeAction(
    dbWith(rows),
    "user-1",
    action({ type: "task.complete", id: "t2" }),
  );
  assert.equal(done.ok, true);
  assert.equal(rows[0]?.status, "done");
  assert.ok(rows[0]?.completed_at);
  assert.equal(rows[0]?.due_on, "2026-10-02");
  assert.equal(rows[0]?.notes, "מגבונים");

  const reopen = await executeAction(
    dbWith(rows),
    "user-1",
    action({ type: "task.reopen", id: "t2" }),
  );
  assert.equal(reopen.ok, true);
  assert.equal(rows[0]?.status, "open");
  assert.equal(rows[0]?.completed_at, null);
  assert.equal(rows[0]?.due_on, "2026-10-02");
  assert.equal(rows[0]?.notes, "מגבונים");
});

test("M2: delete soft-cancels so it disappears from active load", async () => {
  const rows: Row[] = [
    {
      id: "t3",
      user_id: "user-1",
      title: "למחוק",
      notes: "",
      due_on: null,
      due_at: null,
      planned_start_at: null,
      planned_end_at: null,
      reminder_at: null,
      reminder_enabled: false,
      reminder_offset_minutes: null,
      reminder_sent_at: null,
      reminder_claimed_at: null,
      status: "open",
      completed_at: null,
    },
  ];
  const deleted = await executeAction(
    dbWith(rows),
    "user-1",
    action({ type: "task.delete", id: "t3" }),
  );
  assert.equal(deleted.ok, true);
  assert.equal(rows[0]?.status, "cancelled");
});
