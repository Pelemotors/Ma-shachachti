import test from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "../lib/model";
import {
  DEFAULT_AGENT_POLICY,
  applyAgentPolicySignals,
  resolvePersonalAgentPolicy,
} from "../lib/domain/agent-policy";
import { buildAgentContext } from "../lib/domain/agent-context";
import { parseAgentDecisionIsolated } from "../lib/agent/schema";

test("DEPRECATED resolvePersonalAgentPolicy still readable for audit without directives generation", () => {
  const state = emptyState();
  const policy = resolvePersonalAgentPolicy(state);
  assert.equal(policy.deprecated, true);
  assert.equal(policy.preset, "proactive_v1");
  assert.equal(policy.traits.autonomy, DEFAULT_AGENT_POLICY.autonomy);
  assert.deepEqual(policy.directives, []);
});

test("DEPRECATED applyAgentPolicySignals is a production no-op (no learning writes)", () => {
  const state = emptyState();
  const next = applyAgentPolicySignals(state, [
    {
      trait: "clarificationAversion",
      direction: "increase",
      strength: "medium",
      evidence: "behavioral",
    },
    {
      trait: "autonomy",
      direction: "decrease",
      strength: "strong",
      evidence: "explicit",
    },
  ]);
  assert.equal(next.learning.length, 0);
  assert.equal(
    next.learning.some((x) => x.key.startsWith("agent_policy:")),
    false,
  );
});

test("agent context exposes personalAgentGuide instead of trait policy", () => {
  const context = buildAgentContext(emptyState(), {
    now: new Date("2026-09-08T18:00:00.000Z"),
  });
  assert.equal(context.personalAgentGuide.exists, false);
  assert.equal("personalAgentPolicy" in context, false);
  assert.equal("agentPolicy" in context, false);
});

test("agent decision parser ignores deprecated policySignals", () => {
  const parsed = parseAgentDecisionIsolated({
    reply: "הבנתי.",
    explicitActions: [],
    clarification: null,
    proposal: null,
    affectsToday: false,
    policySignals: [
      {
        trait: "autonomy",
        direction: "increase",
        strength: "strong",
        evidence: "explicit",
      },
      {
        trait: "not_a_trait",
        direction: "increase",
        strength: "strong",
        evidence: "explicit",
      },
    ],
  });

  assert.equal(parsed.decision.policySignals.length, 0);
  assert.ok(parsed.parseWarnings.includes("policy_signals_ignored_deprecated"));
});
