import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildAgentPrompt } from "../lib/agent/prompt-builder.ts";
import {
  advanceQaClock,
  describeQaClock,
  isWeekSimulationQa,
  productNow,
  resetQaClock,
  setQaClock,
  wallNow,
} from "../lib/product-clock-server.ts";
import { resolveMentionedJerusalemDate } from "../lib/schedule-query.ts";
import { todayContext } from "../lib/time.ts";

const prevFlag = process.env.WEEK_SIMULATION_QA;
const prevNode = process.env.NODE_ENV;

before(() => {
  process.env.WEEK_SIMULATION_QA = "true";
  process.env.NODE_ENV = "test";
  resetQaClock();
});

after(() => {
  resetQaClock();
  if (prevFlag === undefined) delete process.env.WEEK_SIMULATION_QA;
  else process.env.WEEK_SIMULATION_QA = prevFlag;
  if (prevNode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = prevNode;
});

test("QA flag stays off in production even if WEEK_SIMULATION_QA=true", () => {
  process.env.NODE_ENV = "production";
  process.env.WEEK_SIMULATION_QA = "true";
  assert.equal(isWeekSimulationQa(), false);
  process.env.NODE_ENV = "test";
});

test("todayContext default follows the frozen QA clock across midnight", () => {
  process.env.WEEK_SIMULATION_QA = "true";
  process.env.NODE_ENV = "test";
  setQaClock("2026-09-20T23:50:00+03:00");
  const sunday = todayContext();
  assert.equal(sunday.date, "2026-09-20");
  assert.equal(sunday.currentTime, "23:50");
  assert.equal(sunday.weekday, "יום ראשון");
  assert.equal(
    resolveMentionedJerusalemDate("מחר ב-17:00 רופא ילדים"),
    "2026-09-21",
  );

  advanceQaClock("20m");
  const monday = todayContext();
  assert.equal(monday.date, "2026-09-21");
  assert.equal(monday.currentTime, "00:10");
  assert.equal(monday.weekday, "יום שני");
  assert.equal(resolveMentionedJerusalemDate("מה יש לי היום?"), "2026-09-21");
  assert.equal(resolveMentionedJerusalemDate("מה היה לי אתמול?"), "2026-09-20");

  advanceQaClock("1d");
  const tuesday = todayContext();
  assert.equal(tuesday.date, "2026-09-22");
  assert.equal(resolveMentionedJerusalemDate("מה יש לי היום?"), "2026-09-22");
  assert.equal(resolveMentionedJerusalemDate("מה היה לי אתמול?"), "2026-09-21");
});

test("agent prompt Current date uses ProductClock, not wall time", () => {
  process.env.WEEK_SIMULATION_QA = "true";
  process.env.NODE_ENV = "test";
  setQaClock("2026-09-21T08:00:00+03:00");
  const prompt = buildAgentPrompt({
    compact: {
      profile: null,
      currentTime: todayContext().currentTime,
      memories: [],
      tasks: [],
      consequences: [],
      shopping: [],
      checklists: [],
      historyLimit: 4,
      modules: [],
      memoryCount: 0,
    },
  });
  assert.match(prompt.instructions, /היום: יום שני 2026-09-21/);
  assert.match(prompt.instructions, /השעה עכשיו: 08:00/);
  assert.doesNotMatch(prompt.instructions, /היום: .+ 2026-09-2[02]/);
});

test("wallNow stays on the real clock while ProductClock is frozen", () => {
  process.env.WEEK_SIMULATION_QA = "true";
  process.env.NODE_ENV = "test";
  setQaClock("2020-01-01T06:25:00+02:00");
  assert.equal(productNow().getFullYear(), 2020);
  const delta = Math.abs(wallNow().getTime() - Date.now());
  assert.ok(delta < 2000);
});

test("reset returns ProductClock to real time", () => {
  process.env.WEEK_SIMULATION_QA = "true";
  process.env.NODE_ENV = "test";
  setQaClock("2026-09-20T23:50:00+03:00");
  resetQaClock();
  const snap = describeQaClock();
  assert.equal(snap.source, "real");
  const delta = Math.abs(productNow().getTime() - Date.now());
  assert.ok(delta < 2000);
});
