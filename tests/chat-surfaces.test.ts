import assert from "node:assert/strict";
import { test } from "node:test";
import { composeReply } from "../lib/action-schema.ts";
import {
  applySurfaceTurnPolicy,
  buildInstructions,
  surfaceInputHint,
  todayContext,
} from "../lib/agent/turn.ts";
import { parseChatRequest } from "../lib/chat-request.ts";
import { CHAT_SURFACES, HOME_SURFACES } from "../lib/home-surfaces.ts";
import type { MemoryRow, TaskRow } from "../lib/types.ts";

const dogTask: TaskRow = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "להזמין אוכל לכלב",
  notes: "",
  status: "open",
  due_on: "2026-09-10",
  created_at: "2026-09-10T00:00:00.000Z",
  updated_at: "2026-09-10T00:00:00.000Z",
  completed_at: null,
};

const tomorrowTask: TaskRow = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "יום הורים",
  notes: "17:00",
  status: "open",
  due_on: "2026-09-11",
  created_at: "2026-09-10T00:00:00.000Z",
  updated_at: "2026-09-10T00:00:00.000Z",
  completed_at: null,
};

const memory: MemoryRow[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    kind: "preference",
    content: "מעדיפה ערב קל",
    confidence: "high",
    created_at: "2026-09-10T00:00:00.000Z",
    updated_at: "2026-09-10T00:00:00.000Z",
  },
];

const eveningUtc = new Date("2026-09-10T17:50:00.000Z");
const winterUtc = new Date("2026-01-10T18:50:00.000Z");

const createAction = {
  type: "task.create",
  id: null,
  title: "משימה חדשה מהלוז",
  notes: null,
  due_on: "2026-09-10",
  kind: null,
  content: null,
  confidence: null,
};

const updateAction = {
  type: "task.update",
  id: dogTask.id,
  title: "להזמין אוכל לכלב",
  notes: "הערב",
  due_on: "2026-09-10",
  kind: null,
  content: null,
  confidence: null,
};

function utcClock(date: Date) {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

test("home surfaces expose the chat surface contract", () => {
  assert.deepEqual(
    HOME_SURFACES.map((surface) => surface.id),
    [...CHAT_SURFACES],
  );
});

test("todayContext uses Asia/Jerusalem rather than the host or Vercel UTC clock", () => {
  const summer = todayContext(eveningUtc);
  assert.equal(summer.timeZone, "Asia/Jerusalem");
  assert.equal(summer.date, "2026-09-10");
  assert.equal(summer.currentTime, "20:50");
  assert.equal(summer.localDateTime, "2026-09-10T20:50");
  assert.equal(utcClock(eveningUtc), "17:50");
  assert.notEqual(summer.currentTime, utcClock(eveningUtc));

  const winter = todayContext(winterUtc);
  assert.equal(winter.date, "2026-01-10");
  assert.equal(winter.currentTime, "20:50");
  assert.equal(utcClock(winterUtc), "18:50");
  assert.notEqual(winter.currentTime, utcClock(winterUtc));
});

test("buildInstructions includes Jerusalem current time", () => {
  const text = buildInstructions({
    tasks: [dogTask],
    memory,
    now: eveningUtc,
  });
  assert.match(text, /היום: .+ 2026-09-10/);
  assert.match(text, /השעה עכשיו: 20:50/);
  assert.match(text, /אזור זמן: Asia\/Jerusalem/);
  assert.match(text, /זמן מקומי: 2026-09-10T20:50/);
  assert.doesNotMatch(text, /השעה עכשיו: 17:50/);
});

test("schedule input hint is turn context only and carries Jerusalem time", () => {
  const hint = surfaceInputHint("schedule", eveningUtc);
  assert.equal(surfaceInputHint(null, eveningUtc), "");
  assert.match(hint, /surface=schedule/);
  assert.match(hint, /20:50/);
  assert.match(hint, /Asia\/Jerusalem/);
  assert.doesNotMatch(hint, /צור לי לו״ז להיום/);
});

test("schedule surface is parsed separately from a regular chat message", () => {
  const schedule = parseChatRequest({
    message: "צור לי לו״ז להיום",
    surface: "schedule",
  });
  const typed = parseChatRequest({ message: "צור לי לו״ז להיום" });
  const forgotten = parseChatRequest({
    message: "מה שכחתי?",
    surface: "forgotten",
  });
  const invalid = parseChatRequest({
    message: "צור לי לו״ז להיום",
    surface: "planner",
  });

  assert.equal(schedule.ok, true);
  assert.equal(typed.ok, true);
  assert.equal(forgotten.ok, true);
  assert.equal(invalid.ok, false);
  if (schedule.ok && typed.ok && forgotten.ok) {
    assert.equal(schedule.request.surface, "schedule");
    assert.equal(typed.request.surface, null);
    assert.equal(typed.request.message, schedule.request.message);
    assert.equal(forgotten.request.surface, "forgotten");
    assert.notEqual(schedule.request.surface, typed.request.surface);
  }
});

test("schedule instructions ask for a conversational plan and keep actions empty", () => {
  const text = buildInstructions({
    tasks: [dogTask, tomorrowTask],
    memory,
    surface: "schedule",
    now: eveningUtc,
  });
  assert.match(text, /הוראת turn נוכחי: הצעת לו״ז להיום/);
  assert.match(text, /actions: \[\]/);
  assert.match(text, /presentation: null/);
  assert.match(text, /אל תתכנן שעות שכבר עברו/);
  assert.match(text, /אל תציע פריט שמתחיל לפני 20:50 היום/);
  assert.match(text, /אינה אוטומטית משימה להיום/);
  assert.doesNotMatch(text, /הוראת turn נוכחי: מה שכחתי\?/);
});

test("at 20:50 the schedule turn forbids a 15:00 slot the same day", () => {
  const text = buildInstructions({
    tasks: [dogTask],
    memory: [],
    surface: "schedule",
    now: eveningUtc,
  });
  assert.match(text, /השעה עכשיו: 20:50/);
  assert.match(text, /אל תציע פריט שמתחיל לפני 20:50 היום/);
  const utc = utcClock(eveningUtc);
  assert.equal(utc, "17:50");
  assert.ok("20:50" > "15:00");
  assert.ok(utc < "20:50");
});

test("schedule surface drops task.create and other mutations", () => {
  const created = applySurfaceTurnPolicy({
    surface: "schedule",
    actions: [createAction],
    presentation: { type: "task_list", task_ids: [dogTask.id] },
  });
  const updated = applySurfaceTurnPolicy({
    surface: "schedule",
    actions: [
      updateAction,
      { ...updateAction, type: "task.reschedule" },
      { ...updateAction, type: "task.complete" },
      { ...updateAction, type: "task.delete" },
    ],
    presentation: null,
  });
  assert.deepEqual(created.actions, []);
  assert.equal(created.presentation, null);
  assert.deepEqual(updated.actions, []);
});

test("existing tasks stay unchanged after a schedule proposal turn", () => {
  const before = [dogTask, tomorrowTask];
  const scoped = applySurfaceTurnPolicy({
    surface: "schedule",
    actions: [createAction, updateAction],
    presentation: null,
  });
  assert.deepEqual(scoped.actions, []);
  assert.deepEqual(before, [dogTask, tomorrowTask]);
});

test("after a schedule proposal an explicit follow-up can still use actions", () => {
  const followUp = applySurfaceTurnPolicy({
    surface: null,
    actions: [{ ...updateAction, type: "task.reschedule" }],
    presentation: null,
  });
  assert.equal(followUp.actions.length, 1);
  assert.equal(
    (followUp.actions[0] as { type?: string }).type,
    "task.reschedule",
  );
});

test("forgotten surface drops mutations but may keep a task_list", () => {
  const text = buildInstructions({
    tasks: [dogTask, tomorrowTask],
    memory,
    surface: "forgotten",
    now: eveningUtc,
  });
  assert.match(text, /הוראת turn נוכחי: מה שכחתי\?/);
  assert.match(text, /אין לבנות לו״ז/);
  assert.match(text, /אין להציע שעות ביצוע/);
  assert.match(text, /actions: \[\]/);
  assert.match(text, /presentation.type = "task_list"/);
  assert.doesNotMatch(text, /הוראת turn נוכחי: הצעת לו״ז להיום/);

  const scoped = applySurfaceTurnPolicy({
    surface: "forgotten",
    actions: [createAction, updateAction],
    presentation: { type: "task_list", task_ids: [tomorrowTask.id] },
  });
  assert.deepEqual(scoped.actions, []);
  assert.deepEqual(scoped.presentation, {
    type: "task_list",
    task_ids: [tomorrowTask.id],
  });
});

test("regular chat is unchanged by the surface policy", () => {
  const scoped = applySurfaceTurnPolicy({
    surface: null,
    actions: [createAction],
    presentation: { type: "task_list", task_ids: [dogTask.id] },
  });
  assert.equal(scoped.actions.length, 1);
  assert.equal(scoped.presentation?.type, "task_list");
});

test("schedule reply keeps line breaks and drops save claims when nothing ran", () => {
  const reply = composeReply(
    [
      "שמרתי את המשימה בלוז.",
      "בהתחשב בזה שעכשיו 20:50, הייתי מסדר את המשך הערב כך:",
      "21:00–21:10  להזמין אוכל לכלב",
      "21:10          לסיים להיום",
    ].join("\n"),
    [],
  );
  assert.doesNotMatch(reply, /שמרתי/);
  assert.match(reply, /21:00–21:10  להזמין אוכל לכלב/);
  assert.match(reply, /\n/);
});
