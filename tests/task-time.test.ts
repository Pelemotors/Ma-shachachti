import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectActions } from "../lib/action-schema.ts";
import { executeAction } from "../lib/actions.ts";
import { isExactOpenDuplicate } from "../lib/task-identity.ts";
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
  reminder_enabled: boolean;
  reminder_offset_minutes: number | null;
  reminder_sent_at: string | null;
  reminder_claimed_at: string | null;
  status: string;
};

function dbWith(rows: Row[]) {
  const db = {
    from() {
      let filters: Record<string, string> = {};
      let payload: Record<string, unknown> = {};
      let op: "select" | "insert" | "update" = "select";
      const api = {
        select() {
          return api;
        },
        eq(column: string, value: string) {
          filters[column] = value;
          return api;
        },
        limit() {
          return api;
        },
        insert(next: Record<string, unknown>) {
          op = "insert";
          payload = next;
          const created: Row = {
            id: `new-${rows.length + 1}`,
            user_id: String(next.user_id),
            title: String(next.title),
            notes: String(next.notes ?? ""),
            due_on: (next.due_on as string | null) ?? null,
            due_at: (next.due_at as string | null) ?? null,
            reminder_enabled: next.reminder_enabled !== false,
            reminder_offset_minutes:
              (next.reminder_offset_minutes as number | null) ?? null,
            reminder_sent_at: null,
            reminder_claimed_at: null,
            status: "open",
          };
          rows.push(created);
          api.created = created;
          return api;
        },
        update(next: Record<string, unknown>) {
          op = "update";
          payload = next;
          return api;
        },
        created: undefined as Row | undefined,
        async single() {
          return { data: { id: api.created?.id }, error: null };
        },
        async maybeSingle() {
          const found = rows.find(
            (row) =>
              row.id === filters.id && row.user_id === filters.user_id,
          );
          return { data: found ?? null, error: null };
        },
        then(
          resolve: (value: { data: Row[] | null; error: null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          if (op === "update") {
            const found = rows.find(
              (row) =>
                row.id === filters.id && row.user_id === filters.user_id,
            );
            if (found) Object.assign(found, payload);
            return Promise.resolve({ data: found ? [found] : [], error: null }).then(
              resolve,
              reject,
            );
          }
          const data = rows.filter((row) => row.status === "open");
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return db as never;
}

test("existing tasks without due_at continue working as date-only or undated", () => {
  assert.equal(
    isExactOpenDuplicate(
      { title: "לקנות אוכל לכלב", notes: "", due_on: null },
      { title: "לקנות אוכל לכלב", notes: "", due_on: null, due_at: null },
    ),
    true,
  );
});

test("task.create stores no-date, date-only, and date+time as three states", async () => {
  const noneRows: Row[] = [];
  const none = await executeAction(
    dbWith(noneRows),
    "user-1",
    action({ title: "לקנות אוכל לכלב" }),
  );
  assert.equal(none.ok, true);
  assert.equal(noneRows[0]?.due_on, null);
  assert.equal(noneRows[0]?.due_at, null);

  const dateRows: Row[] = [];
  const dated = await executeAction(
    dbWith(dateRows),
    "user-1",
    action({ title: "לקנות מתנה", due_on: "2026-09-15" }),
  );
  assert.equal(dated.ok, true);
  assert.equal(dateRows[0]?.due_on, "2026-09-15");
  assert.equal(dateRows[0]?.due_at, null);

  const timeRows: Row[] = [];
  const timed = await executeAction(
    dbWith(timeRows),
    "user-1",
    action({ title: "יום הורים לפלא", due_on: "2026-10-23", due_time: "17:00" }),
  );
  assert.equal(timed.ok, true);
  if (timed.ok) assert.equal(timed.due_time, "17:00");
  const expected = resolveTaskDeadline("2026-10-23", "17:00");
  assert.equal(expected.ok, true);
  if (expected.ok) assert.equal(timeRows[0]?.due_at, expected.due_at);
  assert.equal(timeRows[0]?.notes, "");
});

test("time without date is rejected by inspect and execute", async () => {
  const inspected = inspectActions([
    action({ title: "בלי תאריך", due_time: "16:00" }),
  ]);
  assert.equal(inspected.accepted.length, 1);
  const result = await executeAction(
    dbWith([]),
    "user-1",
    inspected.accepted[0]!,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /שעה בלי תאריך/);
});

test("task.update can move between none, date-only, and date+time", async () => {
  const rows: Row[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "user-1",
      title: "יום הורים",
      notes: "לא לקרוא שעה מכאן 17:00",
      due_on: null,
      due_at: null,
      reminder_enabled: true,
      reminder_offset_minutes: null,
      reminder_sent_at: "2026-09-01T00:00:00.000Z",
      reminder_claimed_at: "2026-09-01T00:00:00.000Z",
      status: "open",
    },
  ];
  const id = rows[0]!.id;
  const toDate = await executeAction(
    dbWith(rows),
    "user-1",
    action({
      type: "task.update",
      id,
      due_patch: "set",
      due_on: "2026-10-23",
      due_time: null,
    }),
  );
  assert.equal(toDate.ok, true);
  assert.equal(rows[0]?.due_on, "2026-10-23");
  assert.equal(rows[0]?.due_at, null);

  const toTime = await executeAction(
    dbWith(rows),
    "user-1",
    action({
      type: "task.update",
      id,
      due_patch: "set",
      due_on: "2026-10-23",
      due_time: "17:00",
    }),
  );
  assert.equal(toTime.ok, true);
  assert.ok(rows[0]?.due_at);
  assert.equal(rows[0]?.reminder_sent_at, null);

  const toDateAgain = await executeAction(
    dbWith(rows),
    "user-1",
    action({
      type: "task.update",
      id,
      due_patch: "set",
      due_on: "2026-10-23",
      due_time: null,
    }),
  );
  assert.equal(toDateAgain.ok, true);
  assert.equal(rows[0]?.due_at, null);

  const cleared = await executeAction(
    dbWith(rows),
    "user-1",
    action({ type: "task.update", id, due_patch: "clear" }),
  );
  assert.equal(cleared.ok, true);
  assert.equal(rows[0]?.due_on, null);
  assert.equal(rows[0]?.due_at, null);
  assert.equal(rows[0]?.notes, "לא לקרוא שעה מכאן 17:00");
});
