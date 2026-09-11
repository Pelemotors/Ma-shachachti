import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseChatRequest } from "../lib/chat-request.ts";
import { decodeAppRoute, encodeAppRoute } from "../lib/app-route-state.ts";
import {
  applySurfaceTurnPolicy,
  buildInstructions,
} from "../lib/agent/turn.ts";

test("typed surface contexts accept valid values and reject invalid values", () => {
  const valid = [
    {
      message: "מיקוד",
      surface: "focus",
      surface_context: { type: "focus" },
    },
    {
      message: "תכנון",
      surface: "schedule",
      surface_context: { type: "schedule", date: "2026-09-12" },
    },
    {
      message: "זמן פנוי",
      surface: "free-time",
      surface_context: { type: "free-time", minutes: 20, effort: "low" },
    },
  ];
  for (const body of valid) assert.equal(parseChatRequest(body).ok, true);

  const invalid = [
    { ...valid[0], surface_context: { type: "focus", extra: true } },
    { ...valid[1], surface_context: { type: "schedule", date: "2026-02-30" } },
    { ...valid[2], surface_context: { type: "free-time", minutes: 0 } },
    { ...valid[2], surface_context: { type: "free-time", minutes: 481 } },
    { ...valid[2], surface_context: { type: "free-time", minutes: 10.5 } },
    {
      ...valid[2],
      surface_context: { type: "free-time", minutes: 10, effort: "extreme" },
    },
    { ...valid[0], surface_context: { type: "schedule", date: "2026-09-12" } },
  ];
  for (const body of invalid) assert.equal(parseChatRequest(body).ok, false);
});

test("all surfaces use the existing chat orchestrator", () => {
  const route = readFileSync(
    new URL("../app/api/chat/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /buildInstructions/);
  assert.match(route, /requestAgentDecision/);
  assert.match(route, /surfaceContext/);
  assert.doesNotMatch(route, /rank|keywordRouter|recommendationEngine/);
});

test("focus has no history or composer and free time exposes exact choices", () => {
  const surfaces = readFileSync(
    new URL("../components/personal-agent-surfaces.tsx", import.meta.url),
    "utf8",
  );
  assert.match(surfaces, /const MINUTE_CHOICES = \[5, 10, 20, 30, 60\]/);
  assert.match(surfaces, /selectedMinutes >= 1/);
  assert.match(surfaces, /selectedMinutes <= 480/);
  assert.match(surfaces, /low: "קל"/);
  assert.doesNotMatch(surfaces, /composer|chat history|rank|category|phrase/);
});

test("schedule context is date scoped and mutations wait for approval or save", () => {
  const instructions = buildInstructions({
    tasks: [],
    memory: [],
    surface: "schedule",
    surfaceContext: { type: "schedule", date: "2026-09-14" },
    now: new Date("2026-09-12T10:00:00.000Z"),
  });
  assert.match(instructions, /תאריך היעד הוא 2026-09-14/);
  assert.match(instructions, /due_at הוא התחייבות קבועה/);
  assert.match(instructions, /planned_start_at.*תכנון מוצע/);

  const scoped = applySurfaceTurnPolicy({
    surface: "schedule",
    actions: [{ type: "task.create" }],
    presentation: null,
  });
  assert.deepEqual(scoped.actions, []);
});

test("focus and free-time URLs round trip across refresh and back navigation", () => {
  for (const view of ["focus", "free-time"] as const) {
    const path = encodeAppRoute({ view, date: null, sessionId: null });
    assert.equal(decodeAppRoute(path.split("?")[1] ?? "").view, view);
  }
});
