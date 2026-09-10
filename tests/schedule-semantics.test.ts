import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDecision } from "../lib/action-schema.ts";
import { executeAction, saveTaskPlans } from "../lib/actions.ts";
import { buildInstructions } from "../lib/agent/turn.ts";
import { AGENT_INSTRUCTIONS } from "../lib/agent/instructions.ts";
import {
  replyForPresentation,
  resolveAgentPresentation,
} from "../lib/presentation.ts";
import {
  classifyScheduleDay,
  FIXED_TIME_LABEL,
  taskTouchesDate,
} from "../lib/schedule.ts";
import { isExactOpenDuplicate } from "../lib/task-identity.ts";
import { jerusalemDateTimeToUtc } from "../lib/time.ts";
import type { AgentAction, TaskRow } from "../lib/types.ts";

const cleanId = "11111111-1111-4111-8111-111111111111";
const foodId = "22222222-2222-4222-8222-222222222222";
const exitId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";

function task(partial: Partial<TaskRow> & Pick<TaskRow, "id" | "title">): TaskRow {
  return {
    notes: "",
    status: "open",
    due_on: null,
    due_at: null,
    reminder_offset_minutes: null,
    reminder_enabled: true,
    reminder_sent_at: null,
    reminder_claimed_at: null,
    planned_start_at: null,
    planned_end_at: null,
    reschedule_count: 0,
    last_rescheduled_at: null,
    created_at: "2026-09-11T00:00:00.000Z",
    updated_at: "2026-09-11T00:00:00.000Z",
    completed_at: null,
    ...partial,
  };
}

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

type Row = TaskRow & { user_id: string };

function memoryDb(rows: Row[]) {
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
        neq() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        insert(next: Record<string, unknown>) {
          op = "insert";
          payload = next;
          const created: Row = task({
            id: `new-${rows.length + 1}`,
            title: String(next.title),
            notes: String(next.notes ?? ""),
            due_on: (next.due_on as string | null) ?? null,
            due_at: (next.due_at as string | null) ?? null,
            planned_start_at: (next.planned_start_at as string | null) ?? null,
            planned_end_at: (next.planned_end_at as string | null) ?? null,
            reminder_enabled: next.reminder_enabled !== false,
            reminder_offset_minutes:
              (next.reminder_offset_minutes as number | null) ?? null,
          }) as Row;
          created.user_id = String(next.user_id);
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
            (row) => row.id === filters.id && row.user_id === filters.user_id,
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
          const data = rows.filter((row) => {
            if (filters.status && row.status !== filters.status) return false;
            if (filters.user_id && row.user_id !== filters.user_id) return false;
            return row.status !== "cancelled";
          });
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return db as never;
}

test("proposed morning slot stays planned and does not become due_at", async () => {
  const rows: Row[] = [];
  const result = await executeAction(
    memoryDb(rows),
    "user-1",
    action({
      title: "ניקיון סלון",
      plan_patch: "set",
      planned_date: "2026-09-11",
      planned_start_time: "08:00",
      planned_end_time: "08:30",
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(rows[0]?.due_at, null);
  assert.equal(rows[0]?.due_on, null);
  assert.equal(
    rows[0]?.planned_start_at,
    jerusalemDateTimeToUtc("2026-09-11", "08:00").toISOString(),
  );
  assert.equal(
    rows[0]?.planned_end_at,
    jerusalemDateTimeToUtc("2026-09-11", "08:30").toISOString(),
  );
});

test("parents evening is a real due_at", async () => {
  const rows: Row[] = [];
  const result = await executeAction(
    memoryDb(rows),
    "user-1",
    action({
      title: "יום הורים",
      due_on: "2026-09-11",
      due_time: "17:00",
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(rows[0]?.due_on, "2026-09-11");
  assert.equal(
    rows[0]?.due_at,
    jerusalemDateTimeToUtc("2026-09-11", "17:00").toISOString(),
  );
  assert.equal(rows[0]?.planned_start_at, null);
});

test("laundry as part of a plan is planned time, not a deadline", async () => {
  const rows: Row[] = [];
  await executeAction(
    memoryDb(rows),
    "user-1",
    action({
      title: "כביסה",
      plan_patch: "set",
      planned_date: "2026-09-11",
      planned_start_time: "11:00",
    }),
  );
  assert.equal(rows[0]?.due_at, null);
  assert.ok(rows[0]?.planned_start_at);
});

test("schedule proposal does not write before save", () => {
  const presentation = resolveAgentPresentation(
    {
      type: "schedule_plan",
      date: "2026-09-11",
      items: [
        {
          title: "ניקיון סלון",
          planned_start: "08:00",
          planned_end: "08:30",
          anchor: "planned",
        },
      ],
    },
    [],
    new Date("2026-09-10T20:00:00.000Z"),
  );
  assert.equal(presentation?.type, "schedule_plan");
  if (presentation?.type === "schedule_plan") {
    assert.equal(presentation.saved, false);
    assert.equal(presentation.items[0]?.task_id, null);
    assert.equal(presentation.items[0]?.fixed, false);
  }
});

test("saving a schedule writes planned time for proposed items", async () => {
  const rows: Row[] = [];
  await saveTaskPlans(memoryDb(rows), "user-1", "2026-09-11", [
    {
      title: "ניקיון סלון",
      planned_start: "08:00",
      planned_end: "08:30",
      anchor: "planned",
    },
    {
      title: "יציאה לארוחת חג",
      planned_start: "18:00",
      planned_end: null,
      anchor: "fixed",
    },
  ]);
  const cleaning = rows.find((row) => row.title === "ניקיון סלון");
  const exit = rows.find((row) => row.title === "יציאה לארוחת חג");
  assert.equal(cleaning?.due_at, null);
  assert.ok(cleaning?.planned_start_at);
  assert.equal(exit?.due_at, jerusalemDateTimeToUtc("2026-09-11", "18:00").toISOString());
  assert.equal(exit?.planned_start_at, null);
});

test("planned tasks are not labeled as a fixed hour", () => {
  const planned = task({
    id: cleanId,
    title: "ניקיון",
    planned_start_at: jerusalemDateTimeToUtc("2026-09-11", "08:00").toISOString(),
  });
  const fixed = task({
    id: exitId,
    title: "יציאה",
    due_on: "2026-09-11",
    due_at: jerusalemDateTimeToUtc("2026-09-11", "18:00").toISOString(),
  });
  const day = classifyScheduleDay([planned, fixed], "2026-09-11");
  const plannedItem = day.timed.find((item) => item.task.id === cleanId);
  const fixedItem = day.timed.find((item) => item.task.id === exitId);
  assert.equal(plannedItem?.fixed, false);
  assert.equal(fixedItem?.fixed, true);
  assert.equal(plannedItem?.fixed ? FIXED_TIME_LABEL : null, null);
  assert.equal(fixedItem?.fixed ? FIXED_TIME_LABEL : null, FIXED_TIME_LABEL);
});

test("a task with both due_at and planned_start appears once as fixed", () => {
  const both = task({
    id: exitId,
    title: "יציאה",
    due_on: "2026-09-11",
    due_at: jerusalemDateTimeToUtc("2026-09-11", "18:00").toISOString(),
    planned_start_at: jerusalemDateTimeToUtc("2026-09-11", "08:00").toISOString(),
  });
  const day = classifyScheduleDay([both], "2026-09-11");
  assert.equal(day.timed.length, 1);
  assert.equal(day.timed[0]?.start, "18:00");
  assert.equal(day.timed[0]?.fixed, true);
});

test("another selected date does not show yesterday's timed task", () => {
  const todayTask = task({
    id: cleanId,
    title: "ניקיון",
    planned_start_at: jerusalemDateTimeToUtc("2026-09-11", "08:00").toISOString(),
  });
  const nextDay = classifyScheduleDay([todayTask], "2026-09-12");
  assert.equal(nextDay.timed.length, 0);
  assert.equal(taskTouchesDate(todayTask, "2026-09-12"), false);
  assert.equal(taskTouchesDate(todayTask, "2026-09-11"), true);
});

test("empty day has no throughout bucket and no date-only leakage", () => {
  const dateOnly = task({
    id: foodId,
    title: "סידורים",
    due_on: "2026-09-11",
  });
  const day = classifyScheduleDay([dateOnly], "2026-09-11");
  assert.deepEqual(day.timed, []);
  assert.equal("throughout" in day, false);
  assert.equal(taskTouchesDate(dateOnly, "2026-09-11"), false);
});

test("follow-up explanation turn is allowed to have empty actions", () => {
  const parsed = parseDecision(
    JSON.stringify({
      reply: "היציאה מסומנת שעה קבועה כי זו התחייבות אמיתית. הניקיון הוא רק שיבוץ.",
      actions: [],
      presentation: null,
    }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.actions, []);
    assert.equal(parsed.presentation, null);
  }
  assert.match(AGENT_INSTRUCTIONS, /אל תחזור על action מה-turn הקודם/);
  assert.match(AGENT_INSTRUCTIONS, /אם המשתמש שואל למה/);
  assert.doesNotMatch(AGENT_INSTRUCTIONS, /אם ההודעה מכילה \"למה\"/);
});

test("exact open duplicate is still blocked across timestamp formats", () => {
  assert.equal(
    isExactOpenDuplicate(
      {
        title: "הכנת אוכל לילדים",
        notes: "",
        due_on: "2026-09-11",
        due_at: "2026-09-11T07:00:00+00:00",
        status: "open",
      },
      {
        title: "הכנת אוכל לילדים",
        notes: "",
        due_on: "2026-09-11",
        due_at: "2026-09-11T07:00:00.000Z",
      },
    ),
    true,
  );
});

test("task_list reaches the client contract", () => {
  const existing = task({ id: cleanId, title: "ניקיון סלון ורצפה" });
  const parsed = parseDecision(
    JSON.stringify({
      reply: "יש כרגע דבר אחד שכדאי לשים עליו עין.",
      actions: [],
      presentation: { type: "task_list", task_ids: [cleanId] },
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const resolved = resolveAgentPresentation(parsed.presentation, [existing]);
  assert.equal(resolved?.type, "task_list");
  if (resolved?.type === "task_list") {
    assert.equal(resolved.tasks[0]?.title, "ניקיון סלון ורצפה");
  }
});

test("schedule_plan reaches the client contract", () => {
  const parsed = parseDecision(
    JSON.stringify({
      reply: "הנה לוח הזמנים המוצע שלך",
      actions: [],
      presentation: {
        type: "schedule_plan",
        date: "2026-09-11",
        items: [
          {
            task_id: null,
            title: "ניקיון סלון",
            planned_start: "08:00",
            planned_end: "08:30",
            anchor: "planned",
          },
        ],
      },
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const resolved = resolveAgentPresentation(
    parsed.presentation,
    [],
    new Date("2026-09-10T20:00:00.000Z"),
  );
  assert.equal(resolved?.type, "schedule_plan");
  if (resolved?.type === "schedule_plan") {
    assert.equal(resolved.items[0]?.planned_start, "08:00");
    assert.equal(resolved.items[0]?.fixed, false);
  }
});

test("task_suggestions reach the client contract", () => {
  const parsed = parseDecision(
    JSON.stringify({
      reply: "הנה כמה הצעות",
      actions: [],
      presentation: {
        type: "task_suggestions",
        items: [{ title: "לקפל כביסה", reason: "יש ערמה שגדלה" }],
      },
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const resolved = resolveAgentPresentation(parsed.presentation, []);
  assert.equal(resolved?.type, "task_suggestions");
  if (resolved?.type === "task_suggestions") {
    assert.equal(resolved.items[0]?.title, "לקפל כביסה");
  }
});

test("short reply and presentation stay together on the same turn", () => {
  const existing = task({ id: cleanId, title: "ניקיון סלון ורצפה" });
  const parsed = parseDecision(
    JSON.stringify({
      reply: "יש כרגע דבר אחד שכדאי לשים עליו עין.",
      actions: [],
      presentation: { type: "task_list", task_ids: [cleanId] },
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const resolved = resolveAgentPresentation(parsed.presentation, [existing]);
  const reply = replyForPresentation(parsed.reply, resolved);
  assert.equal(reply, "יש כרגע דבר אחד שכדאי לשים עליו עין.");
  assert.equal(resolved?.type, "task_list");
});

test("presentation task ids are isolated to the current user", () => {
  const own = task({ id: cleanId, title: "שלי" });
  const resolved = resolveAgentPresentation(
    { type: "task_list", task_ids: [otherId] },
    [own],
  );
  assert.equal(resolved, null);
});

test("invalid presentation is dropped and does not mutate", () => {
  const parsed = parseDecision(
    JSON.stringify({
      reply: "הנה כמה הצעות",
      actions: [],
      presentation: { type: "unknown_cards", items: [{ title: "x" }] },
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.presentation, null);
  assert.deepEqual(parsed.actions, []);
  assert.equal(resolveAgentPresentation(parsed.presentation, []), null);
});

test("missing presentation no longer strips a plain reply", () => {
  const reply = replyForPresentation(
    "הנה לוח הזמנים המוצע שלך\n08:00 ניקיון",
    null,
  );
  assert.match(reply, /08:00/);
});

test("instructions keep the agent as the brain and separate due from planned", () => {
  const text = buildInstructions({
    tasks: [],
    memory: [],
    now: new Date("2026-09-11T06:00:00.000Z"),
  });
  assert.match(text, /task_suggestions/);
  assert.match(text, /planned_start_at הוא זמן ביצוע שתוכנן/);
  assert.match(text, /אל תהפוך שעת תכנון שלך ל-due_at/);
  assert.match(text, /plan_patch=set/);
  assert.doesNotMatch(text, /אם surface=schedule: presentation\.type = "schedule_plan"\.\nאחרת presentation = null/);
});
