import test from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "../lib/model";
import { applyActions, requiresConfirmation } from "../lib/engine";
import {
  applyAgentGuideUpdate,
  listLegacyAgentPolicyLearning,
  toRuntimePersonalAgentGuide,
} from "../lib/domain/agent-guide";
import { classifyActionPolicy, agentDecisionJsonSchema } from "../lib/agent/schema";
import {
  buildAgentContextSnapshot,
  invalidateAgentContextCache,
} from "../lib/agent/context-snapshot";
import { buildAgentRuntimeContext } from "../lib/agent/runtime-context";
import { buildEntityIndex } from "../lib/agent/entity-index";
import { buildAgentContext } from "../lib/domain/agent-context";
import { AGENT_CAPABILITY_TYPES } from "../lib/agent/capabilities";

const NOW = new Date("2026-09-09T12:00:00Z");
const TURN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function snapshotSlices(state: ReturnType<typeof emptyState>) {
  return {
    profile: {},
    tasks: state.tasks,
    reminders: state.reminders,
    routines: state.routines,
    plans: state.planning,
    home: state.homeAreas,
    memory: state.facts,
    checklists: [],
    forecasts: state.learning,
    processes: state.operations,
    shopping: state.shopping,
    messages: state.messages,
    workingMemory: state.agentWorkingMemory,
    entityIndex: buildEntityIndex(state, NOW),
    personalAgentGuide: toRuntimePersonalAgentGuide(state),
  };
}

test("PAG-T01: Guide persists only after confirmed proposal action", () => {
  const state = emptyState();
  const action = {
    type: "agentGuide.update" as const,
    expectedRevision: 0,
    text: "עדיפות לתשובות קצרות",
    sourceTurnId: TURN,
    proposalId: PROP,
  };
  assert.equal(classifyActionPolicy(action), "proposal");
  assert.equal(requiresConfirmation([action]), true);
  assert.throws(() => applyActions(state, [action], NOW, false));
  const next = applyActions(state, [action], NOW, true);
  assert.equal(next.personalAgentGuide?.revision, 1);
  assert.equal(next.personalAgentGuide?.text, "עדיפות לתשובות קצרות");
  assert.equal(state.personalAgentGuide, null);
});

test("PAG-T02: rejected proposal leaves DB/state unchanged", () => {
  const state = emptyState();
  const before = structuredClone(state);
  try {
    applyActions(
      state,
      [
        {
          type: "agentGuide.update",
          expectedRevision: 0,
          text: "לא לשמור",
        },
      ],
      NOW,
      false,
    );
    assert.fail("expected confirmation error");
  } catch {
    /* expected */
  }
  assert.deepEqual(state.personalAgentGuide, before.personalAgentGuide);
  assert.equal(state.personalAgentGuideHistory.length, 0);
});

test("PAG-T03: persistence failure path does not bump revision", () => {
  const state = emptyState();
  const failed = applyAgentGuideUpdate(state, {
    expectedRevision: 0,
    text: "",
    now: NOW,
  });
  assert.equal(failed.ok, false);
  assert.equal(state.personalAgentGuide, null);

  const ok = applyAgentGuideUpdate(state, {
    expectedRevision: 0,
    text: "מדריך תקין",
    now: NOW,
  });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  // Simulate caller aborting before save: original state revision stays 0
  assert.equal(state.personalAgentGuide, null);
  assert.equal(ok.state.personalAgentGuide?.revision, 1);
});

test("PAG-T04: stale expectedRevision conflicts and does not overwrite", () => {
  let state = emptyState();
  state = applyActions(
    state,
    [
      {
        type: "agentGuide.update",
        expectedRevision: 0,
        text: "גרסה ראשונה",
      },
    ],
    NOW,
    true,
  );
  const conflict = applyAgentGuideUpdate(state, {
    expectedRevision: 0,
    text: "דריסת גרסה",
    now: NOW,
  });
  assert.equal(conflict.ok, false);
  if (conflict.ok) return;
  assert.equal(conflict.code, "guide_revision_conflict");
  assert.equal(state.personalAgentGuide?.text, "גרסה ראשונה");
  assert.equal(state.personalAgentGuide?.revision, 1);
});

test("PAG-T05: two users have isolated guides", () => {
  let a = emptyState();
  let b = emptyState();
  a = applyActions(
    a,
    [{ type: "agentGuide.update", expectedRevision: 0, text: "מדריך של א" }],
    NOW,
    true,
  );
  b = applyActions(
    b,
    [{ type: "agentGuide.update", expectedRevision: 0, text: "מדריך של ב" }],
    NOW,
    true,
  );
  assert.equal(a.personalAgentGuide?.text, "מדריך של א");
  assert.equal(b.personalAgentGuide?.text, "מדריך של ב");
  assert.notEqual(a.personalAgentGuide?.text, b.personalAgentGuide?.text);
});

test("PAG-T06: guide update rebuilds only guide cache slice", () => {
  invalidateAgentContextCache();
  const hh = "hh-pag-t06";
  let state = emptyState();
  state = applyActions(
    state,
    [{ type: "task.create", task: { title: "משימה", kind: "task" } }],
    NOW,
    true,
  );
  const first = buildAgentContextSnapshot({
    householdId: hh,
    state,
    stateRevision: 1,
    capabilityVersion: "cap",
    slices: snapshotSlices(state),
  });
  assert.ok(first.cacheMisses.includes("tasks"));

  state = applyActions(
    state,
    [
      {
        type: "agentGuide.update",
        expectedRevision: 0,
        text: "מדריך חדש",
      },
    ],
    NOW,
    true,
  );
  const second = buildAgentContextSnapshot({
    householdId: hh,
    state,
    stateRevision: 2,
    capabilityVersion: "cap",
    slices: snapshotSlices(state),
  });
  assert.ok(second.cacheMisses.includes("personalAgentGuide"));
  assert.ok(second.cacheHits.includes("tasks"));
});

test("PAG-T07: task update keeps guide slice reusable", () => {
  invalidateAgentContextCache();
  const hh = "hh-pag-t07";
  let state = emptyState();
  state = applyActions(
    state,
    [
      {
        type: "agentGuide.update",
        expectedRevision: 0,
        text: "מדריך יציב",
      },
    ],
    NOW,
    true,
  );
  buildAgentContextSnapshot({
    householdId: hh,
    state,
    stateRevision: 1,
    capabilityVersion: "cap",
    slices: snapshotSlices(state),
  });
  state = applyActions(
    state,
    [{ type: "task.create", task: { title: "עוד משימה", kind: "task" } }],
    NOW,
    true,
  );
  const next = buildAgentContextSnapshot({
    householdId: hh,
    state,
    stateRevision: 2,
    capabilityVersion: "cap",
    slices: snapshotSlices(state),
  });
  assert.ok(next.cacheHits.includes("personalAgentGuide"));
  assert.ok(next.cacheMisses.includes("tasks"));
});

test("PAG-T08: revisionEntry exists after successful apply; in-state history is not written", () => {
  const state = emptyState();
  const fail = applyAgentGuideUpdate(state, {
    expectedRevision: 0,
    text: "   ",
    now: NOW,
  });
  assert.equal(fail.ok, false);
  assert.equal(state.personalAgentGuideHistory.length, 0);

  const ok = applyAgentGuideUpdate(state, {
    expectedRevision: 0,
    text: "נשמר",
    sourceTurnId: TURN,
    proposalId: PROP,
    now: NOW,
  });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.revisionEntry.revision, 1);
  assert.equal(ok.revisionEntry.previousRevision, 0);
  assert.equal(ok.revisionEntry.proposalId, PROP);
  assert.equal(ok.state.personalAgentGuideHistory.length, 0);
  assert.equal(state.personalAgentGuideHistory.length, 0);
});

test("PAG-T09: production path has no trait learning contract", () => {
  assert.ok(AGENT_CAPABILITY_TYPES.includes("agentGuide.update"));
  const schema = JSON.stringify(agentDecisionJsonSchema());
  assert.equal(schema.includes("clarificationAversion"), false);
  assert.equal(listLegacyAgentPolicyLearning(emptyState()).length, 0);

  const ctx = buildAgentContext(emptyState(), { now: NOW });
  assert.ok("personalAgentGuide" in ctx);
  assert.equal("personalAgentPolicy" in ctx, false);
  assert.equal("important" in ctx, false);
});

test("PAG-T10: runtime receives the correct user guide", () => {
  invalidateAgentContextCache();
  let state = emptyState();
  state = applyActions(
    state,
    [
      {
        type: "agentGuide.update",
        expectedRevision: 0,
        text: "מדריך למשתמשת הנכונה",
      },
    ],
    NOW,
    true,
  );
  const runtime = buildAgentRuntimeContext({
    state,
    stateRevision: 9,
    householdId: "user-correct",
    turnId: TURN,
    requestId: PROP,
    now: NOW,
  });
  assert.equal(runtime.personalAgentGuide.exists, true);
  assert.equal(runtime.personalAgentGuide.text, "מדריך למשתמשת הנכונה");
  assert.equal(runtime.personalAgentGuide.revision, 1);
  assert.ok(
    runtime.instrumentation.contextDomains.includes("personalAgentGuide"),
  );

  const empty = buildAgentRuntimeContext({
    state: emptyState(),
    stateRevision: 0,
    householdId: "user-empty",
    turnId: TURN,
    requestId: PROP,
    now: NOW,
  });
  assert.equal(empty.personalAgentGuide.exists, false);
  assert.equal(empty.personalAgentGuide.revision, 0);
});

test("PERSONAL-EVOLUTION-GATE mechanism: null → rev1 → rev2 replaces document", () => {
  invalidateAgentContextCache();
  let state = emptyState();
  assert.equal(state.personalAgentGuide, null);
  const firstRuntime = buildAgentRuntimeContext({
    state,
    stateRevision: 0,
    householdId: "evo-user",
    turnId: TURN,
    requestId: PROP,
    now: NOW,
  });
  assert.equal(firstRuntime.personalAgentGuide.exists, false);
  assert.equal("personalAgentPolicy" in firstRuntime.knowledge, false);

  state = applyActions(
    state,
    [
      {
        type: "agentGuide.update",
        expectedRevision: 0,
        text: "עדיפות לתשובות קצרות",
        sourceTurnId: TURN,
        proposalId: PROP,
      },
    ],
    NOW,
    true,
  );
  assert.equal(state.personalAgentGuide?.revision, 1);
  const afterFirst = buildAgentRuntimeContext({
    state,
    stateRevision: 1,
    householdId: "evo-user",
    turnId: TURN,
    requestId: PROP,
    now: NOW,
  });
  assert.equal(afterFirst.personalAgentGuide.text, "עדיפות לתשובות קצרות");

  state = applyActions(
    state,
    [
      {
        type: "agentGuide.update",
        expectedRevision: 1,
        text: "עדיפות לתשובות קצרות, ובלי לשאול שאלות מיותרות",
      },
    ],
    NOW,
    true,
  );
  assert.equal(state.personalAgentGuide?.revision, 2);
  assert.equal(
    state.personalAgentGuide?.text,
    "עדיפות לתשובות קצרות, ובלי לשאול שאלות מיותרות",
  );
  const afterSecond = buildAgentRuntimeContext({
    state,
    stateRevision: 2,
    householdId: "evo-user",
    turnId: TURN,
    requestId: PROP,
    now: NOW,
  });
  assert.equal(afterSecond.personalAgentGuide.revision, 2);
  assert.equal(state.personalAgentGuideHistory.length, 0);
});
