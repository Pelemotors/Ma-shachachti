import assert from "node:assert/strict";
import { test } from "node:test";
import {
  rankTaskCandidates,
  stabilizeForgottenSelection,
} from "../lib/agent/candidate-rank.ts";
import { buildCompactContext } from "../lib/agent/context/compact.ts";
import type { TaskRow } from "../lib/types.ts";

function task(
  partial: Partial<TaskRow> & { id: string; title: string; created_at: string },
): TaskRow {
  return {
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
    updated_at: partial.created_at,
    completed_at: null,
    ...partial,
  };
}

test("ranking prefers consequence and overdue over mere recency", () => {
  const newerChore = task({
    id: "11111111-1111-4111-8111-111111111111",
    title: "ניקיון קל",
    created_at: "2026-09-14T00:00:00.000Z",
  });
  const olderImportant = task({
    id: "22222222-2222-4222-8222-222222222222",
    title: "לקבוע תור",
    created_at: "2026-01-01T00:00:00.000Z",
    reschedule_count: 3,
  });
  const ranked = rankTaskCandidates({
    tasks: [newerChore, olderImportant],
    consequences: [
      {
        task_id: olderImportant.id,
        user_id: "u",
        severity: "high",
        reason: "delay hurts",
        confidence: "high",
        basis: { kind: "explicit" },
        valid_until: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    now: new Date("2026-09-15T10:00:00.000Z"),
  });
  assert.equal(ranked[0]?.task.id, olderImportant.id);
});

test("free-time compact is not only newest 40 by created_at", () => {
  const tasks = Array.from({ length: 45 }, (_, index) =>
    task({
      id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
      title: `חדש ${index}`,
      created_at: new Date(Date.UTC(2026, 8, 15, 0, index)).toISOString(),
    }),
  );
  const oldImportant = task({
    id: "22222222-2222-4222-8222-222222222222",
    title: "ישן חשוב",
    created_at: "2025-01-01T00:00:00.000Z",
    reschedule_count: 5,
  });
  tasks.push(oldImportant);
  const ctx = buildCompactContext({
    surface: "free-time",
    surfaceContext: { type: "free-time", minutes: 30, effort: null },
    profile: null,
    currentTime: "13:40",
    queryHint: "",
    allTasks: tasks,
    allMemory: [],
    consequences: [
      {
        task_id: oldImportant.id,
        user_id: "u",
        severity: "critical",
        reason: "x",
        confidence: "high",
        basis: { kind: "explicit" },
        valid_until: null,
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      },
    ],
    shopping: [],
    checklists: [],
  });
  assert.ok(ctx.tasks.some((row) => row.id === oldImportant.id));
  assert.equal(ctx.tasks[0]?.id, oldImportant.id);
});

test("forgotten stabilize fills to 5-6 and is stable for same ranked set", () => {
  const ranked = rankTaskCandidates({
    tasks: Array.from({ length: 10 }, (_, index) =>
      task({
        id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
        title: `t${index}`,
        created_at: `2026-0${(index % 8) + 1}-01T00:00:00.000Z`,
        reschedule_count: 10 - index,
      }),
    ),
    now: new Date("2026-09-15T10:00:00.000Z"),
  });
  const first = stabilizeForgottenSelection({
    selectedIds: ranked.slice(0, 3).map((row) => row.task.id),
    ranked,
  });
  const second = stabilizeForgottenSelection({
    selectedIds: ranked.slice(0, 3).map((row) => row.task.id),
    ranked,
  });
  assert.equal(first.length >= 5, true);
  assert.equal(first.length <= 6, true);
  assert.deepEqual(first, second);
});

test("schedule compact keeps undated candidates in ranked pool", () => {
  const undated = task({
    id: "11111111-1111-4111-8111-111111111111",
    title: "לקבוע תור",
    created_at: "2026-01-01T00:00:00.000Z",
    reschedule_count: 2,
  });
  const choreToday = task({
    id: "22222222-2222-4222-8222-222222222222",
    title: "ניקיון",
    created_at: "2026-09-14T00:00:00.000Z",
    due_on: "2026-09-15",
  });
  const ctx = buildCompactContext({
    surface: "schedule",
    surfaceContext: {
      type: "schedule",
      date: "2026-09-15",
      day_start: "08:00",
      day_end: "22:00",
    },
    profile: null,
    currentTime: "13:40",
    queryHint: "",
    allTasks: [choreToday, undated],
    allMemory: [],
    consequences: [],
    shopping: [],
    checklists: [],
  });
  assert.ok(ctx.tasks.some((row) => row.id === undated.id));
  assert.ok(ctx.tasks.some((row) => row.id === choreToday.id));
});
