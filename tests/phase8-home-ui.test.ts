import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildHomeDisplay, HOME_CHRONOLOGICAL_LIMIT } from "../lib/home-display.ts";
import { APP_VIEWS, encodeAppRoute } from "../lib/app-route-state.ts";
import { HOME_QUICK_LINKS, HOME_SURFACES } from "../lib/home-surfaces.ts";
import type { TaskRow } from "../lib/types.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function task(id: string, patch: Partial<TaskRow>): TaskRow {
  return {
    id,
    title: `משימה ${id}`,
    notes: "",
    status: "open",
    due_on: null,
    due_at: null,
    reminder_at: null,
    reminder_offset_minutes: null,
    reminder_enabled: false,
    reminder_sent_at: null,
    reminder_claimed_at: null,
    planned_start_at: null,
    planned_end_at: null,
    reschedule_count: 0,
    last_rescheduled_at: null,
    created_at: "2026-09-12T00:00:00.000Z",
    updated_at: "2026-09-12T00:00:00.000Z",
    completed_at: null,
    ...patch,
  };
}

test("home display counts selected today tasks and lists only future timed items chronologically", () => {
  const now = new Date("2026-09-12T07:00:00.000Z"); // 10:00 Jerusalem
  const summary = buildHomeDisplay([
    task("done", { status: "done", due_on: "2026-09-12" }),
    task("date-only", { due_on: "2026-09-12" }),
    task("past", { due_on: "2026-09-12", due_at: "2026-09-12T05:00:00.000Z" }),
    task("later", { due_on: "2026-09-12", due_at: "2026-09-12T11:00:00.000Z" }),
    task("next", { planned_start_at: "2026-09-12T08:00:00.000Z" }),
    task("tomorrow", { due_on: "2026-09-13", due_at: "2026-09-13T08:00:00.000Z" }),
    task("unscheduled", {}),
  ], now);

  assert.deepEqual(
    { completed: summary.completed, total: summary.total },
    { completed: 1, total: 5 },
  );
  assert.deepEqual(summary.chronological.map((item) => item.id), ["next", "later"]);
  assert.equal(summary.chronological[0]?.time, "11:00");
  assert.equal(summary.chronological.length <= HOME_CHRONOLOGICAL_LIMIT, true);
});

test("home display is display-only and absent from agent context and turn selection", () => {
  const display = read("../lib/home-display.ts");
  assert.doesNotMatch(display, /rank|importance|recommendation|categor/i);
  for (const path of [
    "../lib/agent/turn.ts",
    "../lib/agent/instructions.ts",
    "../lib/chat-request.ts",
    "../lib/surface-turn.ts",
  ]) {
    assert.doesNotMatch(read(path), /home-display|buildHomeDisplay|HomeDisplaySummary/);
  }
});

test("shared states and mobile safety rules cover the new views", () => {
  const stateUsers = [
    "../components/personal-agent-surfaces.tsx",
    "../components/my-schedule.tsx",
    "../components/lean-lists.tsx",
    "../components/recording-bank.tsx",
    "../components/previous-chats.tsx",
    "../components/memory-learning.tsx",
    "../components/settings-panel.tsx",
  ].map(read).join("\n");
  assert.match(stateUsers, /EmptyState/);
  assert.match(stateUsers, /LoadingState/);
  assert.match(stateUsers, /ErrorState/);

  const css = read("../app/globals.css");
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /max-height: min\(70dvh, 520px\)/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /min-height: 44px/);
});

test("home navigation and route encoder cover every requested destination", () => {
  const ids = [...HOME_SURFACES.map((item) => item.id), ...HOME_QUICK_LINKS.map((item) => item.id)];
  for (const view of [
    "chat", "tasks", "focus", "schedule", "free-time",
    "shopping", "checklists", "recordings", "settings",
  ] as const) {
    assert.ok(APP_VIEWS.includes(view));
    assert.ok(ids.includes(view));
    assert.match(encodeAppRoute({ view, date: view === "schedule" ? "2026-09-12" : null, sessionId: null }), /^\/app/);
  }
});
