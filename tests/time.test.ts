import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dueOnFromDueAt,
  dueTimeFromDueAt,
  jerusalemDateTimeToUtc,
  jerusalemParts,
  resolveTaskDeadline,
  todayContext,
} from "../lib/time.ts";

test("summer Jerusalem date+time converts without a hardcoded offset", () => {
  const utc = jerusalemDateTimeToUtc("2026-07-15", "17:00");
  assert.equal(utc.toISOString(), "2026-07-15T14:00:00.000Z");
  assert.equal(dueOnFromDueAt(utc.toISOString()), "2026-07-15");
  assert.equal(dueTimeFromDueAt(utc.toISOString()), "17:00");
});

test("winter Jerusalem date+time converts without a hardcoded offset", () => {
  const utc = jerusalemDateTimeToUtc("2026-01-15", "17:00");
  assert.equal(utc.toISOString(), "2026-01-15T15:00:00.000Z");
  assert.equal(dueOnFromDueAt(utc.toISOString()), "2026-01-15");
  assert.equal(dueTimeFromDueAt(utc.toISOString()), "17:00");
});

test("due_on follows the Jerusalem calendar date near midnight", () => {
  const utc = jerusalemDateTimeToUtc("2026-01-15", "00:30");
  assert.equal(utc.toISOString(), "2026-01-14T22:30:00.000Z");
  assert.equal(dueOnFromDueAt(utc.toISOString()), "2026-01-15");
  assert.equal(jerusalemParts(utc).time, "00:30");
});

test("todayContext uses Asia/Jerusalem rather than the host clock", () => {
  const summer = todayContext(new Date("2026-09-10T17:50:00.000Z"));
  assert.equal(summer.timeZone, "Asia/Jerusalem");
  assert.equal(summer.date, "2026-09-10");
  assert.equal(summer.currentTime, "20:50");
  const winter = todayContext(new Date("2026-01-15T17:50:00.000Z"));
  assert.equal(winter.date, "2026-01-15");
  assert.equal(winter.currentTime, "19:50");
});

test("resolveTaskDeadline encodes the three task time states", () => {
  assert.deepEqual(resolveTaskDeadline(null, null), {
    ok: true,
    due_on: null,
    due_at: null,
    due_time: null,
  });
  assert.deepEqual(resolveTaskDeadline("2026-09-15", null), {
    ok: true,
    due_on: "2026-09-15",
    due_at: null,
    due_time: null,
  });
  const timed = resolveTaskDeadline("2026-10-23", "17:00");
  assert.equal(timed.ok, true);
  if (timed.ok && timed.due_at) {
    assert.equal(timed.due_on, "2026-10-23");
    assert.equal(timed.due_time, "17:00");
    assert.equal(dueOnFromDueAt(timed.due_at), "2026-10-23");
    assert.equal(dueTimeFromDueAt(timed.due_at), "17:00");
  }
});

test("time without date is rejected", () => {
  const result = resolveTaskDeadline(null, "16:00");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /שעה בלי תאריך/);
});
