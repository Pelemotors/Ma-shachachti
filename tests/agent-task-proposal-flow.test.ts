import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyState, type Action } from "../lib/model";
import { applyActions, activeDailyPlan } from "../lib/engine";
import {
  classifyActionPolicy,
  partitionActionsByPolicy,
  parseAgentDecisionText,
} from "../lib/agent/schema";
import { getActiveTasksForList } from "../lib/domain/tasks/list-order";
import { getHomeTodayTasks } from "../lib/domain/planning/home-today";
import { syncDailyPlanAfterActions } from "../lib/domain/planning/sync-daily-plan";
import {
  buildApproveTaskNotice,
  countPlannedCreates,
  resolveRequestedTodayTaskIds,
  stampTaskCreateIds,
} from "../lib/domain/planning/plan-intent";
import {
  classifyTaskDuplicate,
  isHardDuplicate,
} from "../lib/domain/tasks/dedupe";
import { AGENT_INSTRUCTIONS } from "../lib/agent/instructions";

const NOW = new Date("2026-09-08T10:00:00+03:00");

function createTask(title: string, id?: string): Action {
  return {
    type: "task.create",
    task: {
      ...(id ? { id } : {}),
      title,
      categoryId: "floors",
      kind: "task",
      workMinutes: 20,
      waitMinutes: 0,
      effort: 2,
      priority: 2,
    },
  };
}

test("loose task.create title/task fields normalize into proposal actions", () => {
  const isolated = parseAgentDecisionText(
    JSON.stringify({
      reply: "זיהיתי משימה.",
      explicitActions: [],
      clarification: null,
      proposal: {
        summary: "להוסיף משימה",
        reason: "חובה לתכנן",
        proposedActions: [
          {
            type: "task.create",
            title: "לקבוע תור לרופא",
            text: "ליצור קשר",
            task: {},
          },
        ],
      },
      affectsToday: false,
    }),
  );
  assert.equal(isolated.decision.proposal?.reason, "new_tasks");
  assert.equal(isolated.decision.proposal?.proposedActions.length, 1);
  const a = isolated.decision.proposal!.proposedActions[0];
  assert.equal(a.type, "task.create");
  if (a.type === "task.create") assert.equal(a.task.title, "לקבוע תור לרופא");
});

test("T1: task.create requires proposal bucket, never auto", () => {
  const a = createTask("לקבוע תור לרופא");
  assert.equal(classifyActionPolicy(a), "proposal");
  const { auto, proposal } = partitionActionsByPolicy([a]);
  assert.equal(auto.length, 0);
  assert.equal(proposal.length, 1);
});

test("T2: pending proposal path does not mutate state.tasks before approve", () => {
  const state = emptyState();
  const stamped = stampTaskCreateIds([createTask("להזמין אוכל לכלב")]);
  assert.equal(state.tasks.length, 0);
  assert.equal(stamped.length, 1);
  if (stamped[0].type === "task.create") {
    assert.ok(stamped[0].task.id);
  }
  assert.equal(emptyState().tasks.length, 0);
});

test("T3/T4: approve apply keeps stamped id in state.tasks", () => {
  let state = emptyState();
  const stamped = stampTaskCreateIds([createTask("לקבוע תור לרופא")]);
  assert.equal(stamped[0].type, "task.create");
  const id = stamped[0].type === "task.create" ? stamped[0].task.id! : "";
  state = applyActions(state, stamped, NOW, true);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].id, id);
});

test("T5: retry apply of same create id stays single task", () => {
  const id = crypto.randomUUID();
  let state = emptyState();
  const action = createTask("מדיח", id);
  state = applyActions(state, [action], NOW, true);
  state = applyActions(state, [action], NOW, true);
  assert.equal(state.tasks.filter((t) => t.id === id).length, 1);
  assert.equal(state.tasks.length, 1);
});

test("T6: hard duplicate skips second open occurrence", () => {
  let state = emptyState();
  state = applyActions(state, [createTask("מדיח")], NOW, true);
  const match = classifyTaskDuplicate(state, {
    title: "מדיח",
    kind: "task",
  });
  assert.ok(isHardDuplicate(match));
  const again = applyActions(state, [createTask("מדיח")], NOW, true);
  assert.equal(again.tasks.length, 1);
});

test("T7: approved active chat task appears in Tasks selector", () => {
  let state = emptyState();
  const id = crypto.randomUUID();
  state = applyActions(state, [createTask("ביטוח רכב", id)], NOW, true);
  const list = getActiveTasksForList(state, NOW);
  assert.ok(list.some((t) => t.id === id));
});

test("T8: requestedTodayCreateIndexes → requestedTodayTaskIds with same IDs", () => {
  const actions = stampTaskCreateIds([
    createTask("א"),
    createTask("ב"),
    createTask("ג"),
  ]);
  const ids = resolveRequestedTodayTaskIds({
    actions,
    affectsToday: true,
    requestedTodayCreateIndexes: [0, 2],
  });
  assert.equal(ids.length, 2);
  if (actions[0].type === "task.create" && actions[2].type === "task.create") {
    assert.deepEqual(ids, [actions[0].task.id, actions[2].task.id]);
  }
  // Prefer existingIds over re-expanding all creates
  const kept = resolveRequestedTodayTaskIds({
    actions,
    affectsToday: true,
    existingIds: ids,
  });
  assert.deepEqual(kept, ids);
});

test("T9: today intent with capacity → DailyPlan + Home include task", () => {
  let state = emptyState();
  const id = crypto.randomUUID();
  const creates = [createTask("לפנות מדיח", id)];
  state = applyActions(state, creates, NOW, true);
  state = syncDailyPlanAfterActions({
    state,
    actions: creates,
    affectsToday: true,
    requestedTodayTaskIds: [id],
    now: NOW,
    revision: 1,
  }).state;
  const plan = activeDailyPlan(state);
  assert.ok(plan?.items.some((i) => i.taskId === id));
  const home = getHomeTodayTasks(state, NOW);
  assert.ok(home.tasks.some((t) => t.id === id));
});

test("T10: general task saved to Tasks but not forced into DailyPlan", () => {
  let state = emptyState();
  const id = crypto.randomUUID();
  const creates = [createTask("לקבוע תור לרופא", id)];
  state = applyActions(state, creates, NOW, true);
  state = syncDailyPlanAfterActions({
    state,
    actions: creates,
    affectsToday: false,
    requestedTodayTaskIds: [],
    now: NOW,
    revision: 1,
  }).state;
  assert.ok(state.tasks.some((t) => t.id === id));
  assert.ok(getActiveTasksForList(state, NOW).some((t) => t.id === id));
  const plan = activeDailyPlan(state);
  assert.equal(plan?.items.some((i) => i.taskId === id) ?? false, false);
});

test("T11: success notice claims plan only when exact taskId in plan.items", () => {
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
      plannedCreates: 1,
    }),
    "נוספה משימה ללו״ז של היום.",
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
  assert.equal(countPlannedCreates(["a"], [{ taskId: "b" }]), 0);
  assert.equal(countPlannedCreates(["a"], [{ taskId: "a" }]), 1);
});

test("CREATE TASK INTENT section is bundled in agent instructions", () => {
  assert.match(AGENT_INSTRUCTIONS, /CREATE TASK INTENT/);
  assert.match(AGENT_INSTRUCTIONS, /requestedTodayCreateIndexes/);
  assert.equal(AGENT_INSTRUCTIONS.includes("שמרתי"), false);
});

test("approve client keeps stable idempotency key per proposal", () => {
  const src = readFileSync(
    join(process.cwd(), "hooks/use-proposal-controller.ts"),
    "utf8",
  );
  assert.match(src, /approveIdempotencyKey/);
  assert.equal(src.includes("const key = crypto.randomUUID();"), false);
  assert.match(src, /adoptRemote\(data\.state, data\.revision\)/);
});

test("approve path uses atomic RPC only", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/server/proposals.ts"),
    "utf8",
  );
  assert.match(src, /approve_pending_proposal_save/);
  assert.equal(src.includes('"idempotent_save_app_state"'), false);
});
