import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  getOrCreateDayPlan,
  mergeDayPlanItems,
  replanDay,
  taskIdsForPlanDate,
  updateDayPlan,
  upsertDayPlanItem,
  type DayPlanItemInput,
} from "../lib/day-plan.ts";
import { jerusalemDateTimeToUtc } from "../lib/time.ts";

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  status: string;
  due_on: string | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
};

function memoryDb(state: {
  tasks: TaskRow[];
  plans: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
}) {
  return {
    from(table: string) {
      let filters: Record<string, string> = {};
      let payload: Record<string, unknown> = {};
      let op: "select" | "insert" | "update" | "delete" = "select";
      let inserted: Record<string, unknown> | null = null;
      const api: Record<string, unknown> = {
        select() {
          return api;
        },
        eq(column: string, value: string) {
          filters[column] = value;
          return api;
        },
        order() {
          return api;
        },
        delete() {
          op = "delete";
          if (table === "day_plan_items") {
            const planId = filters.day_plan_id;
            for (let i = state.items.length - 1; i >= 0; i -= 1) {
              if (!planId || state.items[i].day_plan_id === planId) state.items.splice(i, 1);
            }
          }
          return api;
        },
        insert(next: Record<string, unknown> | Record<string, unknown>[]) {
          op = "insert";
          if (table === "day_plans") {
            const row = {
              id: `plan-${state.plans.length + 1}`,
              updated_at: new Date().toISOString(),
              ...(next as Record<string, unknown>),
            };
            state.plans.push(row);
            inserted = row;
            return api;
          }
          if (table === "day_plan_items") {
            const list = Array.isArray(next) ? next : [next];
            for (const row of list) {
              state.items.push({ id: `item-${state.items.length + 1}`, ...row });
            }
            return api;
          }
          return api;
        },
        update(next: Record<string, unknown>) {
          op = "update";
          payload = next;
          return api;
        },
        async single() {
          if (op === "insert" && inserted) return { data: inserted, error: null };
          return { data: inserted, error: null };
        },
        async maybeSingle() {
          if (table === "day_plans") {
            const found = state.plans.find(
              (plan) =>
                (!filters.scope_type || plan.scope_type === filters.scope_type) &&
                (!filters.scope_id || plan.scope_id === filters.scope_id) &&
                (!filters.plan_date || plan.plan_date === filters.plan_date) &&
                (!filters.id || plan.id === filters.id),
            );
            return { data: found ?? null, error: null };
          }
          if (table === "tasks") {
            const found = state.tasks.find(
              (task) =>
                (!filters.id || task.id === filters.id) &&
                (!filters.user_id || task.user_id === filters.user_id),
            );
            return { data: found ?? null, error: null };
          }
          if (table === "household_members") return { data: null, error: null };
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
            if (table === "day_plans") {
              const plan = state.plans.find((row) => row.id === filters.id);
              if (plan) Object.assign(plan, payload);
              return Promise.resolve({ data: plan ? [plan] : [], error: null }).then(resolve, reject);
            }
            if (table === "tasks") {
              const task = state.tasks.find(
                (row) => row.id === filters.id && row.user_id === filters.user_id,
              );
              if (task) Object.assign(task, payload);
              return Promise.resolve({ data: task ? [task] : [], error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          }
          if (table === "day_plan_items") {
            const data = state.items.filter(
              (item) => !filters.day_plan_id || item.day_plan_id === filters.day_plan_id,
            );
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          }
          if (table === "tasks") {
            let data = state.tasks.filter((task) => !filters.user_id || task.user_id === filters.user_id);
            if (filters.id) data = data.filter((task) => task.id === filters.id);
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  } as never;
}

test("source: one day_plan unique key and updateDayPlan bumps updated_at + syncs flexible mirror", () => {
  const dayPlan = read("lib/day-plan.ts");
  assert.match(dayPlan, /syncTaskPlannedMirror/);
  assert.match(dayPlan, /updated_at: now/);
  assert.match(dayPlan, /Point mutation of the canonical day_plan/);
  assert.match(dayPlan, /Explicit rebuild intent only/);
  assert.match(read("database/migrations/20260920_play_release_domain.sql"), /unique \(scope_type, scope_id, plan_date\)/);
});

test("getOrCreateDayPlan returns a single plan per scope+date", async () => {
  const state = { tasks: [], plans: [], items: [] };
  const db = memoryDb(state);
  const first = await getOrCreateDayPlan(db, "user-1", "2026-09-29");
  const second = await getOrCreateDayPlan(db, "user-1", "2026-09-29");
  assert.equal(state.plans.length, 1);
  assert.equal(first.id, second.id);
});

test("updateDayPlan mirrors flexible planned_* and clears when removed", async () => {
  const taskId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const state = {
    tasks: [
      {
        id: taskId,
        user_id: "user-1",
        title: "גמישה",
        status: "open",
        due_on: null,
        planned_start_at: null,
        planned_end_at: null,
      },
    ],
    plans: [],
    items: [],
  };
  const db = memoryDb(state);
  const start = jerusalemDateTimeToUtc("2026-09-29", "10:00").toISOString();
  const end = jerusalemDateTimeToUtc("2026-09-29", "10:45").toISOString();
  await updateDayPlan(db, "user-1", "2026-09-29", [
    {
      task_id: taskId,
      start_at: start,
      end_at: end,
      kind: "flexible",
      source: "manual",
    },
  ]);
  assert.equal(state.tasks[0]?.planned_start_at, start);
  assert.equal(state.tasks[0]?.planned_end_at, end);
  assert.ok(state.plans[0]?.updated_at);
  assert.equal(state.items.length, 1);

  await updateDayPlan(db, "user-1", "2026-09-29", []);
  assert.equal(state.tasks[0]?.planned_start_at, null);
  assert.equal(state.items.length, 0);
});

test("upsert keeps routine occurrence while changing a flexible slot", async () => {
  const flexId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const routineTask = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const state = {
    tasks: [
      {
        id: flexId,
        user_id: "user-1",
        title: "גמישה",
        status: "open",
        due_on: null,
        planned_start_at: null,
        planned_end_at: null,
      },
      {
        id: routineTask,
        user_id: "user-1",
        title: "קבועה",
        status: "open",
        due_on: null,
        planned_start_at: null,
        planned_end_at: null,
      },
    ],
    plans: [
      {
        id: "plan-1",
        scope_type: "user",
        scope_id: "user-1",
        plan_date: "2026-09-29",
        updated_at: "2026-09-29T00:00:00.000Z",
      },
    ],
    items: [
      {
        id: "item-1",
        day_plan_id: "plan-1",
        task_id: routineTask,
        start_at: jerusalemDateTimeToUtc("2026-09-29", "08:00").toISOString(),
        end_at: jerusalemDateTimeToUtc("2026-09-29", "08:30").toISOString(),
        kind: "fixed",
        source: "manual",
        routine_id: "routine-1",
        occurrence_key: "routine-1:2026-09-29",
      },
    ],
  };
  const db = memoryDb(state);
  const moved = jerusalemDateTimeToUtc("2026-09-29", "15:00").toISOString();
  await upsertDayPlanItem(db, "user-1", "2026-09-29", {
    task_id: flexId,
    start_at: moved,
    end_at: jerusalemDateTimeToUtc("2026-09-29", "15:30").toISOString(),
    kind: "flexible",
    source: "manual",
  });
  assert.equal(state.items.length, 2);
  assert.ok(state.items.some((item) => item.occurrence_key === "routine-1:2026-09-29"));
  assert.equal(state.tasks[0]?.planned_start_at, moved);
  assert.equal(state.tasks[1]?.planned_start_at, null);
});

test("unscheduled open tasks without due_on are not auto-selected for a date", () => {
  const ids = taskIdsForPlanDate(
    [
      { id: "a", status: "open", due_on: null },
      { id: "b", status: "open", due_on: "2026-09-30" },
      { id: "c", status: "open", due_on: "2026-09-29" },
    ],
    "2026-09-29",
  );
  assert.deepEqual(ids, ["c"]);
});

test("replanDay preserves existing fixed slots when appending", () => {
  const existing: DayPlanItemInput[] = [
    {
      task_id: "fixed-1",
      start_at: jerusalemDateTimeToUtc("2026-09-29", "09:00").toISOString(),
      end_at: jerusalemDateTimeToUtc("2026-09-29", "09:30").toISOString(),
      kind: "fixed",
      source: "manual",
    },
  ];
  const merged = mergeDayPlanItems(existing, ["flex-1"], "2026-09-29", []);
  assert.equal(merged[0]?.task_id, "fixed-1");
  assert.equal(merged[0]?.kind, "fixed");
  assert.equal(merged[1]?.task_id, "flex-1");
  assert.equal(merged[1]?.source, "replan");
});

test("replanDay is only exported for explicit rebuild (not Home open)", () => {
  const home = read("apps/mobile/src/screens/home-v4/useHomeV4Data.ts");
  assert.doesNotMatch(home, /replanDay/);
  assert.match(home, /getDayPlan/);
  const dayPlanRoute = read("app/api/day-plan/route.ts");
  assert.match(dayPlanRoute, /ensureRoutineOccurrences/);
  assert.match(dayPlanRoute, /action === \"replan\"/);
  assert.equal(typeof replanDay, "function");
});
