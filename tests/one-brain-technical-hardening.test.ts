import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyState, migrateState, type Action } from "../lib/model";
import { applyActions } from "../lib/engine";
import { filterRunnableActions } from "../lib/agent/action-validation";
import { dayContextForDate } from "../lib/domain/planning/day-context";
import { planForDate } from "../lib/domain/planning/plans";
import { detectTimedOverlaps } from "../lib/domain/planning/overlap";
import { deadlineConflictEvidence } from "../lib/domain/tasks/deadline";
import { buildTemporalContext } from "../lib/domain/temporal-context";
import {
  appendExecutionReceipt,
  buildExecutionReceipt,
} from "../lib/domain/execution-receipts";
import {
  lastCompactedCursor,
  pendingCompactionMessages,
  shouldCompactMemory,
} from "../lib/domain/memory/compaction";
import { AGENT_CAPABILITY_TYPES } from "../lib/agent/capabilities";
import { applyAgentGuideUpdate } from "../lib/domain/agent-guide";

const NOW = new Date("2026-09-10T10:00:00+03:00");
const TZ = "Asia/Jerusalem";

function createTask(
  title: string,
  id = crypto.randomUUID(),
  extra: Record<string, unknown> = {},
): Action {
  return {
    type: "task.create",
    task: {
      id,
      title,
      categoryId: "floors",
      kind: "task",
      workMinutes: 20,
      waitMinutes: 0,
      effort: 2,
      priority: 2,
      ...extra,
    },
  };
}

function source(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

test("two plans on different dates stay independent", () => {
  const a = crypto.randomUUID();
  const b = crypto.randomUUID();
  let s = applyActions(emptyState(), [createTask("א", a), createTask("ב", b)], NOW, true);
  s = applyActions(
    s,
    [
      { type: "schedule.set", taskId: a, date: "2026-09-10" },
      { type: "schedule.set", taskId: b, date: "2026-09-11" },
    ],
    NOW,
    true,
  );
  assert.equal(planForDate(s, "2026-09-10")?.items[0]?.taskId, a);
  assert.equal(planForDate(s, "2026-09-11")?.items[0]?.taskId, b);
});

test("365 date keys do not overwrite each other", () => {
  const id = crypto.randomUUID();
  let s = applyActions(emptyState(), [createTask("שנתי", id)], NOW, true);
  const items = [];
  for (let i = 0; i < 365; i++) {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    items.push(date);
    s = applyActions(
      s,
      [
        {
          type: "schedule.replaceDay",
          date,
          items: [
            {
              taskId: id,
              order: 0,
              plannedStart: null,
              plannedEnd: null,
              locked: false,
              planStatus: "planned",
              dayPart: null,
            },
          ],
        },
      ],
      NOW,
      true,
    );
  }
  assert.equal(Object.keys(s.planning.plans).length, 365);
  assert.ok(s.planning.plans[items[0]]);
  assert.ok(s.planning.plans[items[364]]);
});

test("dayContext A does not leak to B", () => {
  let s = applyActions(
    emptyState(),
    [
      {
        type: "planning.set",
        constraint: {
          date: "2026-09-10",
          availableFrom: null,
          availableUntil: null,
          unavailable: [],
          effort: 1,
          note: "יום א",
        },
      },
      {
        type: "planning.set",
        constraint: {
          date: "2026-09-11",
          availableFrom: null,
          availableUntil: null,
          unavailable: [],
          effort: 2,
          note: "יום ב",
        },
      },
    ],
    NOW,
    true,
  );
  assert.equal(dayContextForDate(s, "2026-09-10")?.note, "יום א");
  assert.equal(dayContextForDate(s, "2026-09-11")?.note, "יום ב");
});

test("planning.today migrates into dayContexts", () => {
  const migrated = migrateState({
    ...emptyState(),
    schemaVersion: 2,
    planning: {
      today: {
        date: "2026-09-10",
        availableFrom: null,
        availableUntil: null,
        unavailable: [],
        effort: 2,
        note: "ישן",
        updatedAt: "2026-09-10T08:00:00.000Z",
      },
      plans: {},
    },
  });
  assert.equal(migrated.planning.dayContexts["2026-09-10"]?.note, "ישן");
  assert.equal("today" in migrated.planning, false);
});

test("schedule without time is valid", () => {
  const id = crypto.randomUUID();
  let s = applyActions(emptyState(), [createTask("בלי שעה", id)], NOW, true);
  s = applyActions(
    s,
    [{ type: "schedule.set", taskId: id, date: "2026-09-10", dayPart: "morning" }],
    NOW,
    true,
  );
  const item = planForDate(s, "2026-09-10")!.items[0];
  assert.equal(item.plannedStart, null);
  assert.equal(item.dayPart, "morning");
});

test("schedule with time is valid", () => {
  const id = crypto.randomUUID();
  let s = applyActions(emptyState(), [createTask("עם שעה", id)], NOW, true);
  s = applyActions(
    s,
    [
      {
        type: "schedule.set",
        taskId: id,
        date: "2026-09-10",
        plannedStart: "2026-09-10T07:00:00.000Z",
        plannedEnd: "2026-09-10T07:30:00.000Z",
      },
    ],
    NOW,
    true,
  );
  assert.equal(
    planForDate(s, "2026-09-10")!.items[0].plannedStart,
    "2026-09-10T07:00:00.000Z",
  );
});

test("schedule.remove does not delete the task", () => {
  const id = crypto.randomUUID();
  let s = applyActions(emptyState(), [createTask("נשארת", id)], NOW, true);
  s = applyActions(
    s,
    [
      { type: "schedule.set", taskId: id, date: "2026-09-10" },
      { type: "schedule.remove", taskId: id, date: "2026-09-10" },
    ],
    NOW,
    true,
  );
  assert.ok(s.tasks.some((t) => t.id === id));
  assert.equal(planForDate(s, "2026-09-10")?.items.length ?? 0, 0);
});

test("task + schedule in the same batch persist together", () => {
  const id = crypto.randomUUID();
  const actions: Action[] = [
    createTask("יחד", id),
    { type: "schedule.set", taskId: id, date: "2026-09-10" },
  ];
  const filtered = filterRunnableActions(emptyState(), actions, NOW);
  assert.equal(filtered.rejected.length, 0);
  const s = applyActions(emptyState(), filtered.accepted, NOW, true);
  assert.ok(s.tasks.some((t) => t.id === id));
  assert.equal(planForDate(s, "2026-09-10")?.items[0]?.taskId, id);
});

test("schedule date / order / dayPart updates stay independent of deadline", () => {
  const id = crypto.randomUUID();
  let s = applyActions(
    emptyState(),
    [
      createTask("דדליין ולוז", id, {
        dueAt: "2026-09-12T18:00:00.000Z",
        deadline: {
          date: "2026-09-12",
          time: "21:00",
          timezone: TZ,
          precision: "datetime",
        },
      }),
      { type: "schedule.set", taskId: id, date: "2026-09-10", order: 0 },
    ],
    NOW,
    true,
  );
  const deadline = s.tasks[0].deadline;
  s = applyActions(
    s,
    [
      { type: "schedule.set", taskId: id, date: "2026-09-11", order: 3, dayPart: "evening" },
    ],
    NOW,
    true,
  );
  assert.equal(planForDate(s, "2026-09-10")?.items.length ?? 0, 0);
  assert.equal(planForDate(s, "2026-09-11")?.items[0]?.order, 3);
  assert.equal(planForDate(s, "2026-09-11")?.items[0]?.dayPart, "evening");
  assert.deepEqual(s.tasks[0].deadline, deadline);
});

test("locked timed overlap is recorded as evidence", () => {
  const evidence = detectTimedOverlaps("2026-09-10", [
    {
      taskId: crypto.randomUUID(),
      order: 0,
      plannedStart: "2026-09-10T08:00:00.000Z",
      plannedEnd: "2026-09-10T09:00:00.000Z",
      locked: true,
      planStatus: "planned",
      dayPart: null,
    },
    {
      taskId: crypto.randomUUID(),
      order: 1,
      plannedStart: "2026-09-10T08:30:00.000Z",
      plannedEnd: "2026-09-10T09:30:00.000Z",
      locked: false,
      planStatus: "planned",
      dayPart: null,
    },
  ]);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].conflictingItems[0].locked, false);
});

test("exact datetime deadline is stored and date-only stays date-only", () => {
  const exactId = crypto.randomUUID();
  const dateId = crypto.randomUUID();
  const s = applyActions(
    emptyState(),
    [
      createTask("מדויק", exactId, {
        dueAt: "2026-09-11T16:00:00.000Z",
        deadline: {
          date: "2026-09-11",
          time: "19:00",
          timezone: TZ,
          precision: "datetime",
        },
      }),
      createTask("רק תאריך", dateId, {
        dueAt: null,
        deadline: {
          date: "2026-09-12",
          time: null,
          timezone: TZ,
          precision: "date",
        },
      }),
    ],
    NOW,
    true,
  );
  const exact = s.tasks.find((t) => t.id === exactId)!;
  const dateOnly = s.tasks.find((t) => t.id === dateId)!;
  assert.equal(exact.dueAt, "2026-09-11T16:00:00.000Z");
  assert.equal(exact.deadline?.precision, "datetime");
  assert.equal(dateOnly.dueAt, null);
  assert.equal(dateOnly.deadline?.precision, "date");
  assert.equal(dateOnly.deadline?.time, null);
});

test("deadline and schedule stay independent both ways", () => {
  const id = crypto.randomUUID();
  let s = applyActions(
    emptyState(),
    [
      createTask("שני שדות", id, {
        deadline: {
          date: "2026-09-12",
          time: null,
          timezone: TZ,
          precision: "date",
        },
      }),
      { type: "schedule.set", taskId: id, date: "2026-09-10" },
    ],
    NOW,
    true,
  );
  s = applyActions(
    s,
    [
      {
        type: "task.update",
        id,
        patch: {
          deadline: {
            date: "2026-09-13",
            time: null,
            timezone: TZ,
            precision: "date",
          },
        },
      },
    ],
    NOW,
    true,
  );
  assert.equal(s.tasks[0].deadline?.date, "2026-09-13");
  assert.equal(planForDate(s, "2026-09-10")?.items[0]?.taskId, id);
});

test("after-deadline schedule is evidence only", () => {
  const task = applyActions(
    emptyState(),
    [
      createTask("אחרי דדליין", "11111111-1111-4111-8111-111111111111", {
        deadline: {
          date: "2026-09-10",
          time: null,
          timezone: TZ,
          precision: "date",
        },
      }),
    ],
    NOW,
    true,
  ).tasks[0];
  const evidence = deadlineConflictEvidence(task, {
    date: "2026-09-11",
    plannedStart: null,
  });
  assert.equal(evidence?.relation, "after_deadline");
});

test("execution receipt keeps created entity ids", () => {
  const id = crypto.randomUUID();
  const receipt = buildExecutionReceipt({
    proposalId: crypto.randomUUID(),
    turnId: crypto.randomUUID(),
    resolvedAt: NOW.toISOString(),
    actions: [createTask("חדשה", id)],
  });
  assert.equal(receipt.actions[0]?.entityId, id);
  const next = appendExecutionReceipt(emptyState(), receipt);
  assert.equal(next.recentExecutionReceipts[0]?.actions[0]?.entityId, id);
});

test("working memory can hold entity refs after execution", () => {
  const id = crypto.randomUUID();
  const s = applyActions(
    emptyState(),
    [
      {
        type: "workingMemory.patch",
        patch: {
          objective: "שיבוץ",
          relevantEntityIds: [id],
        },
      },
    ],
    NOW,
    true,
  );
  assert.deepEqual(s.agentWorkingMemory?.relevantEntityIds, [id]);
});

test("midnight changes temporal context and does not clear working memory", () => {
  const withWm = applyActions(
    emptyState(),
    [
      {
        type: "workingMemory.patch",
        patch: {
          objective: "פתוח",
          openLoops: [{ summary: "פתוח", relevantEntityIds: [] }],
        },
      },
    ],
    NOW,
    true,
  );
  const evening = new Date("2026-09-10T21:00:00+03:00");
  const morning = new Date("2026-09-11T01:00:00+03:00");
  const before = buildTemporalContext(withWm, {
    now: evening,
    selectedDate: "2026-09-12",
  });
  const after = buildTemporalContext(withWm, {
    now: morning,
    selectedDate: "2026-09-12",
  });
  assert.equal(before.localDateKey, "2026-09-10");
  assert.equal(after.localDateKey, "2026-09-11");
  assert.equal(after.selectedDateKey, "2026-09-12");
  assert.notEqual(after.selectedDateKey, after.localDateKey);
  assert.equal(after.dayChangedSinceWorkingMemoryUpdate, true);
  assert.equal(withWm.agentWorkingMemory?.objective, "פתוח");
});

test("compaction cursor advances and does not reprocess compacted messages", () => {
  let s = emptyState();
  for (let i = 0; i < 31; i++) {
    s = applyActions(
      s,
      [
        {
          type: "message.add",
          role: i % 2 ? "assistant" : "user",
          text: `הודעה ${i}`,
          turnId: crypto.randomUUID(),
        },
      ],
      NOW,
      true,
    );
  }
  assert.equal(shouldCompactMemory(s), true);
  const cursor = lastCompactedCursor(s);
  s = applyActions(
    s,
    [
      {
        type: "memory.compact",
        facts: ["עובדה"],
        preferences: [],
        patterns: [],
        compactedThroughMessageId: cursor.compactedThroughMessageId,
        compactedThroughCreatedAt: cursor.compactedThroughCreatedAt,
      },
    ],
    NOW,
    true,
  );
  assert.equal(pendingCompactionMessages(s).length, 0);
  assert.equal(shouldCompactMemory(s), false);
});

test("state normalization is idempotent", () => {
  const raw = {
    ...emptyState(),
    schemaVersion: 2,
    tasks: [
      {
        ...emptyState().tasks[0],
        id: crypto.randomUUID(),
        title: "עם dueAt",
        categoryId: "floors",
        kind: "task",
        status: "open",
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        dueAt: "2026-09-11T16:00:00.000Z",
        deadline: null,
        preferredWindow: null,
        hiddenUntil: null,
        startedAt: null,
        workMinutes: 15,
        waitMinutes: 0,
        effort: 2,
        priority: 1,
        dependsOn: [],
        steps: [],
        templateId: null,
        recurrenceDays: null,
        occurrenceOf: null,
        routineId: null,
        notes: "",
        completedAt: null,
        actualWorkMinutes: null,
        durationFeedbackAskedAt: null,
        relatedMemberIds: [],
        homeAreaIds: [],
        classification: {
          source: "user",
          confidence: "high",
          userOverride: false,
        },
        enrichmentStatus: "done",
        detailTypeId: null,
      },
    ],
  };
  const once = migrateState(raw);
  const twice = migrateState(once);
  assert.deepEqual(twice.tasks[0].deadline, once.tasks[0].deadline);
  assert.equal(once.tasks[0].deadline?.precision, "datetime");
});

test("personal guide rev1 then rev2 mechanics", () => {
  let s = emptyState();
  assert.equal(s.personalAgentGuide, null);
  const first = applyAgentGuideUpdate(s, {
    expectedRevision: 0,
    text: "גרסה אחת",
    sourceTurnId: crypto.randomUUID(),
    proposalId: crypto.randomUUID(),
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  s = first.state;
  assert.equal(s.personalAgentGuide?.revision, 1);
  const second = applyAgentGuideUpdate(s, {
    expectedRevision: 1,
    text: "גרסה שתיים",
    sourceTurnId: crypto.randomUUID(),
    proposalId: crypto.randomUUID(),
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.state.personalAgentGuide?.revision, 2);
});

test("failed schedule.set does not leave a half-created task", () => {
  const id = crypto.randomUUID();
  const filtered = filterRunnableActions(
    emptyState(),
    [
      createTask("חצי", id),
      {
        type: "schedule.set",
        taskId: id,
        date: "not-a-date" as unknown as `${number}-${number}-${number}`,
      },
    ],
    NOW,
  );
  assert.ok(filtered.rejected.some((a) => a.type === "task.create"));
  assert.ok(!filtered.accepted.some((a) => a.type === "task.create"));
});

test("Build/Realign/Memory production paths do not call semantic planners", () => {
  const controller = source("../hooks/use-daily-plan-controller.ts");
  assert.match(controller, /scheduleIntent: "build"/);
  assert.match(controller, /scheduleIntent: "realign"/);
  assert.doesNotMatch(controller, /buildDailyPlanSession/);
  assert.doesNotMatch(controller, /replanDailyPlan|planDay/);
  const firstScan = source("../components/views/first-scan-panel.tsx");
  assert.doesNotMatch(firstScan, /buildDailyPlanSession/);
  assert.doesNotMatch(firstScan, /replanDailyPlan/);
  const memory = source("../components/views/memory-view.tsx");
  assert.doesNotMatch(memory, /consumptionInsights/);
  assert.doesNotMatch(memory, /learning\(/);
  assert.doesNotMatch(memory, /calendarSuggestions/);
  assert.match(memory, /clientIntent: "memory.intake"|onRemember/);
  assert.match(memory, /שמירה ידנית בלי סוכן/);
  const suggestions = source("../lib/domain/suggestions.ts");
  assert.doesNotMatch(suggestions, /calendarSuggestions/);
  assert.ok(AGENT_CAPABILITY_TYPES.includes("schedule.replaceDay"));
});

test("cloud proposal restore does not fall back to sessionStorage", () => {
  const controller = source("../hooks/use-proposal-controller.ts");
  assert.match(controller, /sessionStorage.removeItem\(CHAT_UI_KEY\)/);
  assert.match(controller, /return;/);
});

test("task.create id is the same entity used by schedule.set", () => {
  const id = crypto.randomUUID();
  const actions: Action[] = [
    createTask("יציב", id),
    { type: "schedule.set", taskId: id, date: "2026-09-10" },
  ];
  const s = applyActions(emptyState(), actions, NOW, true);
  assert.equal(s.tasks[0].id, id);
  assert.equal(planForDate(s, "2026-09-10")?.items[0]?.taskId, id);
});
