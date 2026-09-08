import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, migrateState } from "../lib/model";
import { applyActions as applyEngine } from "../lib/engine";
import {
  applyWorkingMemoryPatch,
  emptyWorkingMemory,
  migratePendingIntentToWorkingMemory,
} from "../lib/domain/working-memory";
import { buildAgentContext } from "../lib/domain/agent-context";
import {
  AgentActionSchema,
  parseAgentDecisionIsolated,
} from "../lib/agent/schema";

const NOW = new Date("2026-09-08T12:00:00.000Z");

test("A Working Memory schema via empty + patch", () => {
  const base = emptyWorkingMemory(NOW);
  assert.equal(base.objective, null);
  assert.equal(base.openLoops.length, 0);
});

test("B migrate pendingAgentIntent preserves open state not workflow type", () => {
  const taskId = crypto.randomUUID();
  const pending = {
    id: crypto.randomUUID(),
    type: "reminder_create" as const,
    draftActions: [{ type: "reminder.add", title: "רופא", taskId }],
    missingFields: ["dueAt"],
    clarificationQuestion: "מתי להזכיר?",
    contextTaskId: taskId,
    createdAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(),
  };
  const wm = migratePendingIntentToWorkingMemory(pending, NOW);
  assert.notEqual(wm.objective, "reminder_create");
  assert.equal(wm.lastAgentQuestion, "מתי להזכיר?");
  assert.ok(wm.relevantEntityIds.includes(taskId));
  assert.ok(wm.openLoops.length >= 1);

  const loaded = migrateState({
    ...emptyState(),
    schemaVersion: 2,
    pendingAgentIntent: pending,
    agentWorkingMemory: null,
  });
  assert.ok(loaded.agentWorkingMemory);
  assert.equal(loaded.agentWorkingMemory?.lastAgentQuestion, "מתי להזכיר?");
  assert.notEqual(loaded.agentWorkingMemory?.objective, "reminder_create");
});

test("C–F patch semantics: omit keep, null clear, array replace", () => {
  const base = applyWorkingMemoryPatch(
    null,
    {
      objective: "תזכורת לרופא",
      openLoops: [
        { summary: "חסר מועד", relevantEntityIds: [] },
        { summary: "גם חלב", relevantEntityIds: [] },
      ],
      lastAgentQuestion: "מתי?",
    },
    NOW,
  );

  const unchanged = applyWorkingMemoryPatch(base, {}, NOW);
  assert.equal(unchanged.objective, "תזכורת לרופא");
  assert.equal(unchanged.openLoops.length, 2);
  assert.equal(unchanged.lastAgentQuestion, "מתי?");

  const partial = applyWorkingMemoryPatch(base, { objective: "עודכן" }, NOW);
  assert.equal(partial.objective, "עודכן");
  assert.equal(partial.openLoops.length, 2);

  const cleared = applyWorkingMemoryPatch(
    partial,
    { lastAgentQuestion: null },
    NOW,
  );
  assert.equal(cleared.lastAgentQuestion, null);
  assert.equal(cleared.objective, "עודכן");
  assert.equal(cleared.openLoops.length, 2);

  const replaced = applyWorkingMemoryPatch(
    cleared,
    { openLoops: [{ summary: "רק חלב", relevantEntityIds: [] }] },
    NOW,
  );
  assert.equal(replaced.openLoops.length, 1);
  assert.equal(replaced.objective, "עודכן");
});

test("H pendingIntent and workingMemory not in live AgentActionSchema", () => {
  const types = AgentActionSchema.map((x) => x.shape.type.value);
  assert.ok(!types.includes("pendingIntent.set"));
  assert.ok(!types.includes("pendingIntent.clear"));
  assert.ok(!types.includes("workingMemory.patch"));
});

test("I old states still load without agentWorkingMemory field", () => {
  const raw = { ...emptyState(), schemaVersion: 2 } as Record<string, unknown>;
  delete raw.agentWorkingMemory;
  const loaded = migrateState(raw);
  assert.equal(loaded.schemaVersion, 2);
  assert.ok(Array.isArray(loaded.tasks));
});

test("J AgentContext includes Working Memory", () => {
  let s = emptyState();
  s = applyEngine(
    s,
    [
      {
        type: "workingMemory.patch",
        patch: {
          objective: "פתוח",
          lastAgentQuestion: "מתי?",
        },
      },
    ],
    NOW,
    false,
  );
  const ctx = buildAgentContext(s, { now: NOW });
  assert.equal(ctx.workingMemory?.objective, "פתוח");
  assert.equal(ctx.workingMemory?.lastAgentQuestion, "מתי?");
});

test("K AgentDecision parse accepts workingMemoryUpdate patch", () => {
  const parsed = parseAgentDecisionIsolated({
    reply: "בסדר",
    explicitActions: [],
    clarification: null,
    proposal: null,
    affectsToday: false,
    workingMemoryUpdate: {
      lastAgentQuestion: null,
      openLoops: [],
    },
  });
  assert.equal(parsed.decision.workingMemoryUpdate?.lastAgentQuestion, null);
  assert.deepEqual(parsed.decision.workingMemoryUpdate?.openLoops, []);
});

test("L null workingMemoryUpdate means no change signal", () => {
  const parsed = parseAgentDecisionIsolated({
    reply: "היי",
    explicitActions: [],
    clarification: null,
    proposal: null,
    affectsToday: false,
    workingMemoryUpdate: null,
  });
  assert.equal(parsed.decision.workingMemoryUpdate, null);
});
