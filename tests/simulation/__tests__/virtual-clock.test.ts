import assert from "node:assert/strict";
import { test } from "node:test";
import { VirtualClock } from "../runner/virtual-clock.ts";

test("virtual clock advances minutes hours and days", () => {
  const clock = new VirtualClock("2026-09-21T05:00:00.000Z", "Asia/Jerusalem");
  assert.equal(clock.nowIso(), "2026-09-21T05:00:00.000Z");
  clock.advanceMinutes(30);
  assert.equal(clock.nowIso(), "2026-09-21T05:30:00.000Z");
  clock.advanceHours(2);
  assert.equal(clock.nowIso(), "2026-09-21T07:30:00.000Z");
  clock.advanceDays(1);
  assert.equal(clock.nowIso(), "2026-09-22T07:30:00.000Z");
  assert.equal(clock.isMonotonic(), true);
});

test("virtual clock is timezone-aware for display", () => {
  const clock = new VirtualClock("2026-07-15T14:00:00.000Z", "Asia/Jerusalem");
  assert.match(clock.nowInZone(), /^2026-07-15T17:00:00/);
});

test("virtual clock refuses backward movement", () => {
  const clock = new VirtualClock("2026-09-21T05:00:00.000Z");
  assert.throws(() => clock.advanceMinutes(-1));
  assert.throws(() => clock.setTime("2026-09-21T04:00:00.000Z"));
  clock.reset("2026-09-20T00:00:00.000Z");
  assert.equal(clock.nowIso(), "2026-09-20T00:00:00.000Z");
});
