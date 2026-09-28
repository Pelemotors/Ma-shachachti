import assert from "node:assert/strict";
import { test } from "node:test";
import { executeAction } from "../lib/actions.ts";
import { createRoutine, findActiveRoutineByTask, stopRoutine } from "../lib/routines.ts";
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

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  notes: string;
  status: string;
  checklist_id: string | null;
  completed_at: string | null;
  due_on: string | null;
  due_at: string | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
};

type RoutineRow = {
  id: string;
  user_id: string;
  task_id: string;
  weekdays: number[];
  time_of_day: string | null;
  starts_on: string;
  ends_on: string | null;
  active: boolean;
};

type ExceptionRow = {
  id: string;
  user_id: string;
  routine_id: string;
  occurrence_date: string;
  kind: string;
  time_of_day: string | null;
};

/**
 * Minimal DB stub covering tasks + routines + exceptions for M3 lifecycle.
 */
function dbWith(state: {
  tasks: TaskRow[];
  routines: RoutineRow[];
  exceptions: ExceptionRow[];
}) {
  const db = {
    from(table: string) {
      let filters: Record<string, string | boolean | number> = {};
      let payload: Record<string, unknown> = {};
      let op: "select" | "insert" | "update" | "delete" = "select";
      const api: Record<string, unknown> = {
        select() {
          return api;
        },
        eq(column: string, value: string | boolean | number) {
          filters[column] = value;
          return api;
        },
        in(column: string, values: Array<string | number>) {
          filters[`in:${column}`] = values.join(",");
          return api;
        },
        is() {
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
          if (table === "routine_occurrence_exceptions") {
            for (let i = state.exceptions.length - 1; i >= 0; i -= 1) {
              const row = state.exceptions[i];
              if (
                (!filters.user_id || row.user_id === filters.user_id) &&
                (!filters.routine_id || row.routine_id === filters.routine_id) &&
                (!filters.occurrence_date || row.occurrence_date === filters.occurrence_date)
              ) {
                state.exceptions.splice(i, 1);
              }
            }
          }
          return api;
        },
        insert(next: Record<string, unknown> | Record<string, unknown>[]) {
          op = "insert";
          if (table === "routines") {
            const row = {
              id: `routine-${state.routines.length + 1}`,
              user_id: String((next as Record<string, unknown>).user_id),
              task_id: String((next as Record<string, unknown>).task_id),
              weekdays: ((next as Record<string, unknown>).weekdays as number[]) ?? [],
              time_of_day: ((next as Record<string, unknown>).time_of_day as string | null) ?? null,
              starts_on: String((next as Record<string, unknown>).starts_on),
              ends_on: ((next as Record<string, unknown>).ends_on as string | null) ?? null,
              active: true,
            };
            state.routines.push(row);
            api.created = row as never;
            return api;
          }
          if (table === "routine_occurrence_exceptions") {
            const row = {
              id: `ex-${state.exceptions.length + 1}`,
              ...(next as Record<string, unknown>),
            } as ExceptionRow;
            const idx = state.exceptions.findIndex(
              (item) =>
                item.routine_id === row.routine_id &&
                item.occurrence_date === row.occurrence_date,
            );
            if (idx >= 0) state.exceptions[idx] = row;
            else state.exceptions.push(row);
            return api;
          }
          payload = next as Record<string, unknown>;
          const created: TaskRow = {
            id: `task-${state.tasks.length + 1}`,
            user_id: String(payload.user_id),
            title: String(payload.title),
            notes: String(payload.notes ?? ""),
            status: String(payload.status ?? "open"),
            checklist_id: (payload.checklist_id as string | null) ?? null,
            completed_at: null,
            due_on: (payload.due_on as string | null) ?? null,
            due_at: (payload.due_at as string | null) ?? null,
            planned_start_at: (payload.planned_start_at as string | null) ?? null,
            planned_end_at: (payload.planned_end_at as string | null) ?? null,
          };
          state.tasks.push(created);
          api.created = created;
          return api;
        },
        update(next: Record<string, unknown>) {
          op = "update";
          payload = next;
          return api;
        },
        upsert(next: Record<string, unknown>) {
          op = "insert";
          return api.insert(next);
        },
        created: undefined as TaskRow | RoutineRow | undefined,
        async single() {
          return { data: { id: (api.created as { id?: string } | undefined)?.id }, error: null };
        },
        async maybeSingle() {
          if (table === "day_plans") {
            return { data: null, error: null };
          }
          if (table === "household_members") {
            return { data: null, error: null };
          }
          if (table === "routines") {
            const found = state.routines.find((row) => {
              if (filters.id && row.id !== filters.id) return false;
              if (filters.user_id && row.user_id !== filters.user_id) return false;
              if (filters.task_id && row.task_id !== filters.task_id) return false;
              if (filters.active !== undefined && row.active !== filters.active) return false;
              return true;
            });
            return { data: found ?? null, error: null };
          }
          if (table === "tasks") {
            const found = state.tasks.find(
              (row) =>
                (!filters.id || row.id === filters.id) &&
                (!filters.user_id || row.user_id === filters.user_id),
            );
            return { data: found ?? null, error: null };
          }
          return { data: null, error: null };
        },
        then(
          resolve: (value: { data: unknown; error: null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          if (op === "delete") {
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
          if (op === "update") {
            if (table === "routines") {
              const found = state.routines.find((row) => {
                if (filters.id && row.id !== filters.id) return false;
                if (filters.user_id && row.user_id !== filters.user_id) return false;
                return true;
              });
              if (found) Object.assign(found, payload);
              return Promise.resolve({ data: found ? [found] : [], error: null }).then(
                resolve,
                reject,
              );
            }
            if (table === "tasks") {
              const found = state.tasks.find(
                (row) =>
                  row.id === filters.id &&
                  (!filters.user_id || row.user_id === filters.user_id),
              );
              if (found) Object.assign(found, payload);
              return Promise.resolve({ data: found ? [found] : [], error: null }).then(
                resolve,
                reject,
              );
            }
          }
          if (table === "routines") {
            return Promise.resolve({
              data: state.routines.filter((row) => {
                if (filters.user_id && row.user_id !== filters.user_id) return false;
                if (filters.active !== undefined && row.active !== filters.active) return false;
                return true;
              }),
              error: null,
            }).then(resolve, reject);
          }
          if (table === "routine_occurrence_exceptions") {
            return Promise.resolve({ data: state.exceptions, error: null }).then(resolve, reject);
          }
          if (table === "day_plan_items" || table === "day_plans") {
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          }
          if (table === "tasks") {
            return Promise.resolve({
              data: state.tasks.filter((row) => {
                if (filters.user_id && row.user_id !== filters.user_id) return false;
                if (filters.status && row.status !== filters.status) return false;
                if (filters.id && row.id !== filters.id) return false;
                return true;
              }).map((row) => ({ ...row, estimate_minutes: null })),
              error: null,
            }).then(resolve, reject);
          }
          return Promise.resolve({
            data: state.tasks.filter((row) => {
              if (filters.user_id && row.user_id !== filters.user_id) return false;
              if (filters.status && row.status !== filters.status) return false;
              return true;
            }),
            error: null,
          }).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return db as never;
}

test("M3: create routine persists on task and stop leaves task open without duplicate", async () => {
  const state = { tasks: [] as TaskRow[], routines: [] as RoutineRow[], exceptions: [] as ExceptionRow[] };
  const db = dbWith(state);
  const created = await executeAction(
    db,
    "user-1",
    action({ title: "כביסה קבועה", notes: "שבועית" }),
  );
  assert.equal(created.ok, true);
  const taskId = created.ok ? created.id : "";
  assert.ok(taskId);
  await createRoutine(db, "user-1", {
    taskId: taskId!,
    weekdays: [0, 1, 2, 3, 4],
    timeOfDay: "09:00",
    startsOn: "2026-09-28",
  });
  assert.equal(state.routines.length, 1);
  assert.equal(state.routines[0]?.active, true);
  assert.equal(state.routines[0]?.task_id, taskId);
  // Second create updates the same active routine (no duplicate).
  await createRoutine(db, "user-1", {
    taskId: taskId!,
    weekdays: [1, 3],
    timeOfDay: "10:00",
    startsOn: "2026-09-28",
  });
  assert.equal(state.routines.length, 1);
  assert.deepEqual(state.routines[0]?.weekdays, [1, 3]);
  assert.equal(state.routines[0]?.time_of_day, "10:00");

  await stopRoutine(db, "user-1", state.routines[0]!.id, "2026-09-28");
  assert.equal(state.routines[0]?.active, false);
  assert.equal(state.tasks[0]?.status, "open");
  assert.equal(state.tasks[0]?.title, "כביסה קבועה");
  const active = await findActiveRoutineByTask(db, "user-1", taskId!);
  assert.equal(active, null);
});

test("M3: occurrence complete does not close the recurring task template", async () => {
  const state = {
    tasks: [
      {
        id: "task-1",
        user_id: "user-1",
        title: "תרופות",
        notes: "בוקר",
        status: "open",
        checklist_id: null,
        completed_at: null,
        due_on: null,
        due_at: null,
        planned_start_at: null,
        planned_end_at: null,
      },
    ] as TaskRow[],
    routines: [
      {
        id: "routine-1",
        user_id: "user-1",
        task_id: "task-1",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        time_of_day: "08:00",
        starts_on: "2026-09-01",
        ends_on: null,
        active: true,
      },
    ] as RoutineRow[],
    exceptions: [] as ExceptionRow[],
  };
  const db = dbWith(state);
  const result = await executeAction(
    db,
    "user-1",
    action({
      type: "task.complete",
      id: "task-1",
      occurrence_date: "2026-09-28",
      series_scope: "once",
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(state.tasks[0]?.status, "open");
  assert.equal(state.tasks[0]?.completed_at, null);
  assert.equal(state.routines[0]?.active, true);
  assert.equal(state.exceptions[0]?.kind, "done");
  assert.equal(state.exceptions[0]?.occurrence_date, "2026-09-28");

  const reopen = await executeAction(
    db,
    "user-1",
    action({
      type: "task.reopen",
      id: "task-1",
      occurrence_date: "2026-09-28",
    }),
  );
  assert.equal(reopen.ok, true);
  assert.equal(state.exceptions.length, 0);
  assert.equal(state.tasks[0]?.status, "open");
});

test("M3: task.update checklist_patch links and clears checklist_id", async () => {
  const state = {
    tasks: [
      {
        id: "task-1",
        user_id: "user-1",
        title: "יציאה",
        notes: "",
        status: "open",
        checklist_id: null,
        completed_at: null,
        due_on: null,
        due_at: null,
        planned_start_at: null,
        planned_end_at: null,
      },
    ] as TaskRow[],
    routines: [] as RoutineRow[],
    exceptions: [] as ExceptionRow[],
  };
  const db = dbWith(state);
  const linked = await executeAction(
    db,
    "user-1",
    action({
      type: "task.update",
      id: "task-1",
      checklist_patch: "set",
      checklist_id: "11111111-1111-4111-8111-111111111111",
    }),
  );
  assert.equal(linked.ok, true);
  assert.equal(state.tasks[0]?.checklist_id, "11111111-1111-4111-8111-111111111111");
  const cleared = await executeAction(
    db,
    "user-1",
    action({
      type: "task.update",
      id: "task-1",
      checklist_patch: "clear",
    }),
  );
  assert.equal(cleared.ok, true);
  assert.equal(state.tasks[0]?.checklist_id, null);
});
