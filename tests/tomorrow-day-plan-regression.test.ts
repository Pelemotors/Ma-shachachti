import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterDayPlanForQuery,
  isMoreOfSameDayFollowup,
  resolveMentionedJerusalemDate,
} from "../lib/schedule-query.ts";
import { addJerusalemDays, todayContext } from "../lib/time.ts";

const NOW = new Date("2026-09-20T10:00:00.000Z");
const TODAY = todayContext(NOW).date;
const TOMORROW = addJerusalemDays(TODAY, 1);

const tomorrowMorning = {
  task_id: "tmr-1",
  start_at: "2026-09-21T07:00:00.000Z",
  kind: "flexible",
};
const tomorrowAfternoon = {
  task_id: "tmr-2",
  start_at: "2026-09-21T11:00:00.000Z",
  kind: "flexible",
};
const tomorrowDone = {
  task_id: "tmr-done",
  start_at: "2026-09-21T08:00:00.000Z",
  kind: "flexible",
};

const tasks = [
  { id: "today-1", title: "משימת היום", status: "open" },
  { id: "tmr-1", title: "לקחת חבילה", status: "open" },
  { id: "tmr-2", title: "לתאם בייביסיטר", status: "open" },
  { id: "tmr-done", title: "כבר בוצע מחר", status: "done" },
];

test("מה יש לי מחר resolves to tomorrow, not today", () => {
  assert.equal(resolveMentionedJerusalemDate("מה יש לי מחר?", NOW), TOMORROW);
  assert.notEqual(resolveMentionedJerusalemDate("מה יש לי מחר?", NOW), TODAY);
  assert.equal(resolveMentionedJerusalemDate("מה יש לי היום?", NOW), TODAY);
});

test("tomorrow day_plan query does not return today or completed items", () => {
  // loadDayPlan(date) is the SoT boundary — today's plan never enters this list.
  assert.notEqual(TODAY, TOMORROW);
  const visible = filterDayPlanForQuery({
    targetDate: TOMORROW,
    todayDate: TODAY,
    items: [tomorrowMorning, tomorrowAfternoon, tomorrowDone],
    tasks,
  });
  assert.deepEqual(
    visible.map((item) => item.task_id).sort(),
    ["tmr-1", "tmr-2"],
  );
  assert.ok(!visible.some((item) => item.task_id === "today-1"));
  assert.ok(!visible.some((item) => item.task_id === "tmr-done"));
});

test("מה עוד אני יכול לעשות מחר does not repeat already shown items", () => {
  assert.equal(isMoreOfSameDayFollowup("מה עוד אני יכול לעשות מחר?"), true);
  const first = filterDayPlanForQuery({
    targetDate: TOMORROW,
    todayDate: TODAY,
    items: [tomorrowMorning, tomorrowAfternoon, tomorrowDone],
    tasks,
  });
  const followup = filterDayPlanForQuery({
    targetDate: TOMORROW,
    todayDate: TODAY,
    items: [tomorrowMorning, tomorrowAfternoon, tomorrowDone],
    tasks,
    alreadyShownTaskIds: first.map((item) => item.task_id),
    excludeAlreadyShown: true,
  });
  assert.equal(followup.length, 0);
});
