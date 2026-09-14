import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCompactContext } from "../lib/agent/context/compact.ts";
import { selectPersonalMemories } from "../lib/agent/context/memory-select.ts";
import { parseContextRequests } from "../lib/agent/context/deep-access.ts";
import { resolveInsightsPresentation } from "../lib/presentation.ts";
import type { MemoryRow, TaskRow } from "../lib/types.ts";

const task = (id: string, title: string): TaskRow =>
  ({
    id,
    title,
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
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T00:00:00.000Z",
    completed_at: null,
  }) as TaskRow;

test("forgotten compact context keeps high-recall open tasks", () => {
  const tasks = Array.from({ length: 40 }, (_, i) =>
    task(
      `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
      `משימה ${i}`,
    ),
  );
  const compact = buildCompactContext({
    surface: "forgotten",
    surfaceContext: { type: "forgotten" },
    profile: null,
    currentTime: "12:00",
    queryHint: "",
    allTasks: tasks,
    allMemory: [],
    consequences: [],
    shopping: [],
    checklists: [],
  });
  assert.equal(compact.tasks.length, 40);
  assert.ok(compact.modules.includes("forgotten-high-recall"));
});

test("memory selector prefers user source and keyword overlap", () => {
  const memories: MemoryRow[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      kind: "fact",
      content: "אוהב קפה בבוקר",
      confidence: "high",
      source: "agent",
      seen_at: null,
      created_at: "2026-09-14T00:00:00.000Z",
      updated_at: "2026-09-14T00:00:00.000Z",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      kind: "preference",
      content: "מתחיל את היום בשמונה",
      confidence: "high",
      source: "user",
      seen_at: null,
      created_at: "2026-09-13T00:00:00.000Z",
      updated_at: "2026-09-13T00:00:00.000Z",
    },
  ];
  const selected = selectPersonalMemories({
    memories,
    queryHint: "מתי מתחיל היום",
    limit: 1,
  });
  assert.equal(selected[0]?.id, memories[1]?.id);
});

test("context_requests parse is closed and capped", () => {
  const parsed = parseContextRequests([
    { entity: "memories", query: "יום", limit: 10 },
    { entity: "hackers", query: "x", limit: 99 },
    { entity: "memories", query: "יום", limit: 10 },
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.entity, "memories");
});

test("insights presentation resolves inference items", () => {
  const resolved = resolveInsightsPresentation({
    type: "insights",
    items: [
      {
        kind: "inference",
        title: "יכול להיות שכדאי להזמין אוכל מראש",
        detail: "יש משימה לדחות אוכל לכלב",
        related_task_id: null,
      },
    ],
  });
  assert.equal(resolved?.type, "insights");
  assert.equal(resolved?.items.length, 1);
});
