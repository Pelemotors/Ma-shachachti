import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, TaskCreateInputSchema, type Action } from "../lib/model";
import { applyActions } from "../lib/engine";
import {
  classifyTaskDuplicate,
  isHardDuplicate,
} from "../lib/domain/tasks/dedupe";
import { isDuplicatePendingReminder } from "../lib/domain/reminders/dedupe";
import {
  buildGroundedProposalSummary,
  buildAgentContext,
} from "../lib/domain/agent-context";
import { getDeferrableCandidates } from "../lib/domain/tasks/deferrable";
import {
  resolveRequestedTodayTaskIds,
  stampTaskCreateIds,
  buildApproveTaskNotice,
} from "../lib/domain/planning/plan-intent";
import { GLOBAL_AGENT_CONSTITUTION } from "../lib/agent/instructions";
import { RUNTIME_CAPABILITY_CONTRACT } from "../lib/agent/runtime-contract";

const NOW = new Date("2026-09-08T10:00:00+03:00");

test("T01 Agent task provenance is agent not migration", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [
      {
        type: "task.create",
        task: { title: "לקבוע תור לרופא", kind: "task" },
      },
    ],
    NOW,
    true,
  );
  assert.equal(s.tasks[0].classification.source, "agent");
  assert.notEqual(s.tasks[0].classification.source, "migration");
});

test("T02 unspecified personal task priority defaults to 2", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [{ type: "task.create", task: { title: "לקבוע תור", kind: "task" } }],
    NOW,
    true,
  );
  assert.equal(s.tasks[0].priority, 2);
});

test("T03–T05 explicit priorities from create input", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [
      {
        type: "task.create",
        task: { title: "מגירה", kind: "task", priority: 1 },
      },
      {
        type: "task.create",
        task: { title: "ביטוח", kind: "task", priority: 3 },
      },
    ],
    NOW,
    true,
  );
  assert.equal(s.tasks.find((t) => t.title === "מגירה")?.priority, 1);
  assert.equal(s.tasks.find((t) => t.title === "ביטוח")?.priority, 3);
});

test("T06 follow-up urgency updates existing task", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [{ type: "task.create", task: { title: "ביטוח", kind: "task" } }],
    NOW,
    true,
  );
  const id = s.tasks[0].id;
  s = applyActions(
    s,
    [{ type: "task.update", id, patch: { priority: 3 } }],
    NOW,
    true,
  );
  assert.equal(s.tasks[0].priority, 3);
});

test("T07 urgent reminder urgency", () => {
  let s = emptyState();
  const due = new Date(NOW.getTime() + 10 * 60000).toISOString();
  s = applyActions(
    s,
    [
      {
        type: "reminder.add",
        title: "לקנות מים",
        dueAt: due,
        taskId: null,
        urgency: "urgent",
      },
    ],
    NOW,
    true,
  );
  assert.equal(s.reminders[0].urgency, "urgent");
});

test("T11 proposal summary rebuilt from final actions", () => {
  assert.equal(
    buildGroundedProposalSummary([
      { type: "task.create" },
      { type: "task.create" },
    ]),
    "זיהיתי 2 משימות. להוסיף אותן לרשימת המשימות?",
  );
  assert.equal(
    buildGroundedProposalSummary([{ type: "task.create" }]),
    "זיהיתי משימה אחת. להוסיף אותה לרשימת המשימות?",
  );
});

test("T12 today intent survives create filtering via IDs", () => {
  const actions = stampTaskCreateIds([
    {
      type: "task.create",
      task: { title: "א", kind: "task" },
    },
    {
      type: "task.create",
      task: { title: "ב", kind: "task" },
    },
  ] as Action[]);
  const ids = resolveRequestedTodayTaskIds({
    actions,
    affectsToday: true,
    requestedTodayCreateIndexes: [1],
  });
  assert.equal(ids.length, 1);
  const kept = resolveRequestedTodayTaskIds({
    actions: [actions[1]!],
    affectsToday: true,
    existingIds: ids,
  });
  assert.deepEqual(kept, ids);
});

test("T13 same active task + new dueAt is similar not hard duplicate", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [{ type: "task.create", task: { title: "לקבוע תור לרופא", kind: "task" } }],
    NOW,
    true,
  );
  const match = classifyTaskDuplicate(s, {
    title: "לקבוע תור לרופא",
    kind: "task",
    dueAt: new Date(NOW.getTime() + 86400000).toISOString(),
  });
  assert.equal(match.confidence, "similar");
  assert.equal(isHardDuplicate(match), false);
});

test("T14 forceNewOccurrence bypasses dedupe", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [{ type: "task.create", task: { title: "כביסה", kind: "task" } }],
    NOW,
    true,
  );
  const match = classifyTaskDuplicate(s, {
    title: "כביסה",
    kind: "task",
    forceNewOccurrence: true,
  });
  assert.equal(match.confidence, "none");
});

test("T15 reminder semantic duplicate", () => {
  const due = new Date(NOW.getTime() + 3600000).toISOString();
  assert.equal(
    isDuplicatePendingReminder(
      [
        {
          title: "תזכיר לקנות מים",
          dueAt: due,
          taskId: null,
          status: "pending",
        },
      ],
      { title: "תזכורת: לקנות מים", dueAt: due, taskId: null },
    ),
    true,
  );
});

test("T17 AgentContext includes members and working memory", () => {
  let s = emptyState();
  s = {
    ...s,
    members: [
      {
        id: crypto.randomUUID(),
        name: "ניקו",
        type: "child",
        aliases: ["ניקולאס"],
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ],
    agentWorkingMemory: {
      objective: "להשלים תזכורת",
      contextSummary: "שאלה על מועד",
      openLoops: [{ summary: "ממתינים לשעה", relevantEntityIds: [] }],
      lastAgentQuestion: "מתי?",
      relevantEntityIds: [],
      assumptions: [],
      updatedAt: NOW.toISOString(),
    },
  };
  const ctx = buildAgentContext(s, { now: NOW });
  assert.equal(ctx.members[0]?.aliases[0], "ניקולאס");
  assert.equal(ctx.workingMemory?.lastAgentQuestion, "מתי?");
  assert.ok(ctx.personalAgentGuide);
  assert.ok(ctx.userKnowledge);
  assert.ok(ctx.nowLocal);
  assert.equal(ctx.timezone, s.profile.timezone);
});

test("T20 deferral protects in_progress", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [
      { type: "task.create", task: { title: "א", kind: "task", priority: 1 } },
      { type: "task.create", task: { title: "ב", kind: "task", priority: 1 } },
    ],
    NOW,
    true,
  );
  s = applyActions(s, [{ type: "task.start", id: s.tasks[0].id }], NOW, true);
  const { candidates, protected: prot } = getDeferrableCandidates(s, NOW);
  assert.ok(prot.some((p) => p.reason === "in_progress"));
  assert.ok(candidates.every((c) => c.taskId !== s.tasks[0].id));
});

test("T28/T29 truthful notices", () => {
  assert.equal(
    buildApproveTaskNotice({
      appliedCount: 1,
      skippedCount: 0,
      todayIntent: false,
      plannedCreates: 0,
    }),
    "נוספה משימה.",
  );
  assert.equal(
    buildApproveTaskNotice({
      appliedCount: 1,
      skippedCount: 0,
      todayIntent: true,
      plannedCreates: 0,
    }),
    "המשימה נשמרה, אבל לא נכנסה כרגע ללו״ז של היום.",
  );
});

test("TaskCreateInputSchema does not inject migration defaults", () => {
  const parsed = TaskCreateInputSchema.parse({ title: "בדיקה" });
  assert.equal(parsed.classification, undefined);
  assert.equal(parsed.enrichmentStatus, undefined);
  assert.equal(parsed.priority, undefined);
});

test("instructions include constitution learning and runtime working memory", () => {
  assert.match(GLOBAL_AGENT_CONSTITUTION, /דרך העבודה האישית/);
  assert.match(GLOBAL_AGENT_CONSTITUTION, /זיכרון ולמידה לאורך זמן/);
  assert.match(RUNTIME_CAPABILITY_CONTRACT, /Working Memory/);
  assert.match(RUNTIME_CAPABILITY_CONTRACT, /Personal Agent Guide/);
});
