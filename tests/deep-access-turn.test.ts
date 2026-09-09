import test from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "../lib/model";
import { applyActions } from "../lib/engine";
import { orchestrateChatTurn } from "../lib/agent/orchestration";
import {
  executeDeepAccessRound,
  parseDeepAccessRequests,
  MAX_DEEP_ACCESS_CALLS_PER_TURN,
} from "../lib/agent/deep-access-turn";
import { parseAgentDecisionIsolated } from "../lib/agent/schema";
import type { AgentDecision } from "../lib/agent/schema";

const NOW = new Date("2026-09-09T10:00:00Z");
const LIST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-000000000099";

function consentState() {
  const s = emptyState();
  return { ...s, profile: { ...s.profile, aiConsent: true } };
}

function decision(
  partial: Partial<AgentDecision> & Pick<AgentDecision, "reply">,
): AgentDecision {
  return {
    explicitActions: [],
    clarification: null,
    proposal: null,
    affectsToday: false,
    initiative: "user_requested",
    deepAccessRequests: [],
    workingMemoryUpdate: null,
    ...partial,
  };
}

test("deep access parser keeps only published doors and does not invent tools", () => {
  const parsed = parseDeepAccessRequests([
    { tool: "state.get_checklist", entityId: LIST_ID },
    { tool: "invented.door", entityId: LIST_ID },
    { tool: "state.get_shopping_history" },
  ]);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.tool, "state.get_checklist");
  assert.equal(parsed[1]?.tool, "state.get_shopping_history");
});

test("missing checklist id returns not_found without fabricating data", () => {
  const { hits } = executeDeepAccessRound({
    state: emptyState(),
    requests: [{ tool: "state.get_checklist", entityId: LIST_ID }],
    round: 1,
    callsUsed: 0,
  });
  assert.equal(hits[0]?.ok, false);
  assert.equal(hits[0]?.error, "not_found");
  assert.equal(hits[0]?.data, null);
});

test("turn loop: LLM chooses checklist id, server hydrates, then final action", async () => {
  let state = consentState();
  const actions = Array.from({ length: 12 }, (_, i) => ({
    type: "checklist.create" as const,
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`,
    title: i === 9 ? "טיסה" : `רשימה ${i + 1}`,
    items: [{ text: "בסיס" }],
  }));
  state = applyActions(state, actions, NOW, true);
  const flightId = "aaaaaaaa-aaaa-4aaa-8aaa-000000000009";
  let calls = 0;
  const result = await orchestrateChatTurn({
    state,
    revision: 1,
    message: "תוסיף מטען לצ׳קליסט של הטיסה",
    contextTaskId: null,
    turnId: "11111111-1111-4111-8111-111111111111",
    requestId: "22222222-2222-4222-8222-222222222222",
    modelCall: async (_model, _instructions, input) => {
      calls += 1;
      const payload = input as {
        runtime: {
          deepAccess: { results: { entityId?: string; ok: boolean; data: unknown }[] };
          entityIndex: { personalChecklists: { entries: { id: string; title: string }[] } };
        };
      };
      if (calls === 1) {
        const hit = payload.runtime.entityIndex.personalChecklists.entries.find(
          (e) => e.title === "טיסה",
        );
        assert.ok(hit);
        return {
          model: "injected",
          rejectedActions: [],
          decision: decision({
            reply: "אבדוק את צ׳קליסט הטיסה לפני שאוסיף.",
            deepAccessRequests: [
              { tool: "state.get_checklist", entityId: hit.id },
            ],
          }),
        };
      }
      const opened = payload.runtime.deepAccess.results[0];
      assert.equal(opened?.ok, true);
      assert.equal(opened?.entityId, flightId);
      return {
        model: "injected",
        rejectedActions: [],
        decision: decision({
          reply: "אציע להוסיף מטען לצ׳קליסט הטיסה.",
          initiative: "user_requested",
          proposal: {
            summary: "הוספת מטען",
            reason: "other",
            proposedActions: [
              {
                type: "checklist.item.add",
                checklistId: flightId,
                text: "מטען",
              },
            ],
          },
        }),
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.proposal?.proposedActions[0]?.type, "checklist.item.add");
  const llmReads = result.instrumentation.deepAccess.filter(
    (row) => row.source === "llm_request",
  );
  assert.equal(llmReads.length, 1);
  assert.equal(llmReads[0]?.ok, true);
  assert.equal(llmReads[0]?.tool, "state.get_checklist");
});

test("deep access budget stops infinite loops", async () => {
  const state = consentState();
  let calls = 0;
  await orchestrateChatTurn({
    state,
    revision: 1,
    message: "מה יש בקניות הישנות?",
    contextTaskId: null,
    turnId: "11111111-1111-4111-8111-111111111111",
    requestId: "22222222-2222-4222-8222-222222222222",
    modelCall: async () => {
      calls += 1;
      return {
        model: "injected",
        rejectedActions: [],
        decision: decision({
          reply: "צריך עוד מידע.",
          deepAccessRequests: [
            { tool: "state.get_shopping_history" },
            { tool: "state.get_history" },
            { tool: "state.get_behavior_events" },
          ],
        }),
      };
    },
  });
  assert.ok(calls <= MAX_DEEP_ACCESS_CALLS_PER_TURN);
  assert.ok(calls >= 2);
});

test("invalid deepAccessRequests do not drop the rest of the decision", () => {
  const isolated = parseAgentDecisionIsolated({
    reply: "אבדוק.",
    explicitActions: [],
    clarification: null,
    proposal: null,
    affectsToday: false,
    deepAccessRequests: [
      { tool: "state.get_agent_guide" },
      { tool: "not.a.door" },
    ],
  });
  assert.equal(isolated.decision.deepAccessRequests?.length, 1);
  assert.equal(isolated.decision.deepAccessRequests?.[0]?.tool, "state.get_agent_guide");
});
