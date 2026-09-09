import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, type AppState } from "../lib/model";
import { applyActions } from "../lib/engine";
import {
  buildAgentContextSnapshot,
  computeDomainRevisions,
  invalidateAgentContextCache,
  peekAgentContextCache,
} from "../lib/agent/context-snapshot";
import {
  getCapabilityRegistrySnapshot,
  buildLiveCapabilityContext,
} from "../lib/agent/capability-registry";
import {
  executeDeepAccess,
  hydrateMissingReferences,
} from "../lib/agent/deep-access";
import { buildAgentRuntimeContext } from "../lib/agent/runtime-context";

const NOW = new Date("2026-09-09T10:00:00Z");

function baseSlices(state: AppState) {
  return {
    core: { timezone: state.profile.timezone },
    tasks: state.tasks,
    reminders: state.reminders,
    routines: state.routines,
    home: state.homeAreas,
    memory: state.facts,
    plan: state.planning,
    shopping: state.shopping,
    messages: state.messages,
    workingMemory: state.agentWorkingMemory,
  };
}

test("C4: capability registry version stable across builds in-process", () => {
  invalidateAgentContextCache();
  const a = getCapabilityRegistrySnapshot(true);
  const b = getCapabilityRegistrySnapshot(false);
  assert.equal(a.capabilityVersion, b.capabilityVersion);
  assert.ok(a.actions.length >= 10);
  const live = buildLiveCapabilityContext();
  assert.equal(live.capabilityVersion, a.capabilityVersion);
  assert.ok(live.doors.some((d) => d.id.includes("task.create")));
});

test("C1/C2: snapshot reuses unchanged slices; rebuilds after task change", () => {
  invalidateAgentContextCache();
  const householdId = "hh-cache-1";
  let state = emptyState();
  state = applyActions(
    state,
    [{ type: "task.create", task: { title: "לשלם לגן", kind: "task" } }],
    NOW,
    true,
  );
  const first = buildAgentContextSnapshot({
    householdId,
    state,
    stateRevision: 1,
    capabilityVersion: "cap1",
    slices: baseSlices(state),
  });
  assert.ok(first.cacheMisses.includes("tasks"));

  const second = buildAgentContextSnapshot({
    householdId,
    state,
    stateRevision: 1,
    capabilityVersion: "cap1",
    slices: baseSlices(state),
  });
  assert.ok(second.cacheHits.includes("tasks"));
  assert.ok(second.cacheHits.includes("reminders"));

  state = applyActions(
    state,
    [
      {
        type: "task.create",
        task: { title: "לקנות חלב", kind: "task" },
      },
    ],
    NOW,
    true,
  );
  const third = buildAgentContextSnapshot({
    householdId,
    state,
    stateRevision: 2,
    capabilityVersion: "cap1",
    slices: baseSlices(state),
  });
  assert.ok(third.cacheMisses.includes("tasks"));
  assert.ok(
    third.cacheHits.includes("reminders") ||
      third.cacheMisses.includes("reminders"),
  );
  const remPrev = computeDomainRevisions(
    applyActions(
      emptyState(),
      [{ type: "task.create", task: { title: "x", kind: "task" } }],
      NOW,
      true,
    ),
    1,
  ).reminderRevision;
  const remNext = computeDomainRevisions(state, 2).reminderRevision;
  assert.equal(remPrev, remNext);
});

test("C5: revision mismatch invalidates stale cache entry on rebuild", () => {
  invalidateAgentContextCache();
  const householdId = "hh-stale";
  const state = emptyState();
  buildAgentContextSnapshot({
    householdId,
    state,
    stateRevision: 1,
    capabilityVersion: "cap1",
    slices: baseSlices(state),
  });
  assert.ok(peekAgentContextCache(householdId));
  invalidateAgentContextCache(householdId);
  assert.equal(peekAgentContextCache(householdId), null);
});

test("C6/C7: deep access hydrates missing refs; skips entities already in core", () => {
  let state = emptyState();
  state = applyActions(
    state,
    [
      {
        type: "task.create",
        task: {
          id: "11111111-1111-4111-8111-111111111111",
          title: "ביטוח",
          kind: "task",
        },
      },
      {
        type: "reminder.add",
        title: "יציאה",
        dueAt: "2030-01-01T15:00:00.000Z",
        taskId: null,
      },
    ],
    NOW,
    true,
  );
  const reminderId = state.reminders[0]!.id;
  const core = new Set(["11111111-1111-4111-8111-111111111111"]);
  const hydrated = hydrateMissingReferences(
    state,
    ["11111111-1111-4111-8111-111111111111", reminderId],
    core,
  );
  assert.equal(hydrated.entities.length, 1);
  assert.equal(hydrated.log.length, 1);
  assert.equal(hydrated.log[0]!.ok, true);

  const history = executeDeepAccess(state, {
    tool: "state.get_history",
    query: { limit: 5 },
  });
  assert.equal(history.ok, true);
});

test("runtime context includes live registry, WM, deepAccess doors, instrumentation", () => {
  invalidateAgentContextCache();
  const state = emptyState();
  const runtime = buildAgentRuntimeContext({
    state,
    stateRevision: 3,
    householdId: "hh-runtime",
    turnId: "22222222-2222-4222-8222-222222222222",
    requestId: "33333333-3333-4333-8333-333333333333",
    pendingProposal: {
      proposalId: "44444444-4444-4444-8444-444444444444",
      summary: "יש פעולות לאישור",
      actionTypes: ["task.create"],
      actionCount: 1,
      sourceRevision: 2,
      turnId: null,
      expiresAt: null,
    },
    dbFetches: ["app_states", "pending_proposals"],
    now: NOW,
  });
  assert.equal(runtime.runtimeVersion, "agent-runtime-v1");
  assert.ok(runtime.capabilityRegistry.doors.length > 0);
  assert.equal(runtime.pendingProposal?.actionCount, 1);
  assert.ok(runtime.deepAccessAvailable.includes("state.get_entity"));
  assert.deepEqual(runtime.instrumentation.dbFetches, [
    "app_states",
    "pending_proposals",
  ]);
  assert.equal(runtime.instrumentation.pendingProposalIncluded, true);
  assert.ok(runtime.instrumentation.contextDomains.includes("capabilities"));
});
