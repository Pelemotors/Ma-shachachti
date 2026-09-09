import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Agent Surface Coverage Gate — architecture map, not an intent taxonomy.
 *
 * Surface | UI trigger | controller | request path | decision source | result | persistence
 * WhatForgot | Home → focus | useFocusController | /api/chat surface=focus | Personal Agent | presentation.taskIds | WM refs only
 * FreeTime | Home → free + CTA | useFreeTimeController | /api/chat surface=free_time | Personal Agent | presentation.taskIds | WM refs only
 * Build | Daily schedule | useDailyPlanController | /api/chat surface=planning | Personal Agent | schedule actions / proposal | proposal
 * Realign | Daily schedule | useDailyPlanController | /api/chat surface=planning | Personal Agent | schedule actions / proposal | proposal
 * ChangedDay | Daily schedule | useDailyPlanController | /api/chat surface=planning | Personal Agent | schedule actions / proposal | proposal
 * Forecast | Home forecast | chat.sendMessage FORECAST_USER_INTENT | /api/chat | Personal Agent | reply / actions | existing
 * Memory | Memory view | chat.processMemory | /api/chat surface=memory | Personal Agent | typed actions | proposal/persist
 * FirstScan | Kit panel | /api/first-scan/analyze | orchestrateChatTurn first_scan | Personal Agent | scanDraft | approve actions
 * Home catalog | kit-invite | catalog suggestions() | none | MECHANICAL catalog visibility | navigation | none
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

test("Focus production uses Personal Agent and not deterministic ranking", () => {
  const view = read("components/views/focus-view.tsx");
  const hook = read("hooks/use-focus-controller.ts");
  const turn = read("hooks/use-agent-surface-turn.ts");
  const home = read("components/views/home-view.tsx");
  assert.match(home, /onNavigate\("focus"\)/);
  assert.match(hook, /surface:\s*"focus"/);
  assert.match(turn, /\/api\/chat/);
  assert.match(turn, /surface:\s*input.surface/);
  assert.doesNotMatch(view, /overdueOrUnknownTasks/);
  assert.doesNotMatch(view, /rankForgotten/);
  assert.doesNotMatch(view, /whatForgotNow/);
  assert.doesNotMatch(view, /followUps/);
  assert.doesNotMatch(hook, /overdueOrUnknownTasks|rankForgotten|followUps/);
});

test("Free Time production sends minutes+effort and does not rank by estimatedMinutes", () => {
  const hook = read("hooks/use-free-time-controller.ts");
  const view = read("components/views/free-time-view.tsx");
  assert.match(hook, /surface:\s*"free_time"/);
  assert.match(hook, /availableMinutes/);
  assert.match(hook, /effort/);
  assert.doesNotMatch(hook, /estimatedMinutes/);
  assert.doesNotMatch(view, /estimatedMinutes/);
  assert.doesNotMatch(hook, /freeTimeV2|opportunities\(/);
});

test("First Scan production has no silent slice, no heuristic fallback, no forced null timing", () => {
  const route = read("app/api/first-scan/analyze/route.ts");
  const ai = read("lib/domain/first-scan/ai.ts");
  const semantic = read("lib/domain/first-scan/semantic.ts");
  const panel = read("components/views/first-scan-panel.tsx");
  assert.match(ai, /orchestrateChatTurn/);
  assert.doesNotMatch(ai, /SCAN_INSTRUCTIONS/);
  assert.doesNotMatch(ai, /text\.slice\(0,\s*8000\)/);
  assert.doesNotMatch(route, /text\.slice\(0,\s*8000\)/);
  assert.doesNotMatch(route, /analyzeScanText/);
  assert.doesNotMatch(ai, /analyzeScanText/);
  assert.doesNotMatch(panel, /analyzeScanText/);
  assert.doesNotMatch(semantic, /recurrenceDays:\s*null/);
  assert.doesNotMatch(semantic, /dueAt:\s*null,\s*\n\s*\}\)/);
});

test("Planning and Memory remain Agent-owned", () => {
  const plan = read("hooks/use-daily-plan-controller.ts");
  const chat = read("hooks/use-chat-controller.ts");
  const homeApp = read("components/home-app.tsx");
  assert.match(plan, /surface:\s*"planning"/);
  assert.match(plan, /scheduleIntent:\s*"build"/);
  assert.match(plan, /scheduleIntent:\s*"changed-day"/);
  assert.match(plan, /realign/);
  assert.match(chat, /surface:\s*"memory"/);
  assert.match(homeApp, /FORECAST_USER_INTENT/);
});

test("Home catalog copy is mechanical, not a personalized recommender", () => {
  const home = read("components/views/home-view.tsx");
  assert.match(home, /רעיונות מהקטלוג|קטלוג/);
  assert.doesNotMatch(home, /שמתאימות לבית שלכם/);
});
