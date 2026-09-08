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

test(
  "personal agent starts from proactive default without storing a user-specific guess",
  () => {
    const state = emptyState();
    const policy = resolvePersonalAgentPolicy(state);

    assert.equal(policy.preset, "proactive_v1");
    assert.equal(policy.traits.autonomy, DEFAULT_AGENT_POLICY.autonomy);
    assert.equal(
      policy.traits.clarificationAversion,
      DEFAULT_AGENT_POLICY.clarificationAversion,
    );
    assert.ok(policy.directives.some((x) => x.includes("clarification")));
    assert.equal(
      state.learning.some((x) => x.key.startsWith("agent_policy:")),
      false,
    );
  },
);

test(
  "behavioral evidence adapts slowly instead of rewriting the agent from one turn",
  () => {
    const state = emptyState();
    const next = applyAgentPolicySignals(state, [
      {
        trait: "clarificationAversion",
        direction: "increase",
        strength: "medium",
        evidence: "behavioral",
      },
    ]);
    const policy = resolvePersonalAgentPolicy(next);

    assert.equal(
      policy.traits.clarificationAversion,
      DEFAULT_AGENT_POLICY.clarificationAversion + 0.04,
    );
    const insight = next.learning.find(
      (x) => x.key === "agent_policy:clarificationAversion",
    );
    assert.equal(insight?.samples, 1);
    assert.equal(insight?.confidence, "low");
  },
);

test(
  "explicit preference moves the personal agent more than behavioral evidence",
  () => {
    const base = emptyState();
    const behavioral = applyAgentPolicySignals(base, [
      {
        trait: "timePrecision",
        direction: "increase",
        strength: "strong",
        evidence: "behavioral",
      },
    ]);
    const explicit = applyAgentPolicySignals(base, [
      {
        trait: "timePrecision",
        direction: "increase",
        strength: "strong",
        evidence: "explicit",
      },
    ]);

    assert.ok(
      resolvePersonalAgentPolicy(explicit).traits.timePrecision >
        resolvePersonalAgentPolicy(behavioral).traits.timePrecision,
    );
  },
);

test("only one signal per trait is applied in a single turn", () => {
  const state = emptyState();
  const next = applyAgentPolicySignals(state, [
    {
      trait: "autonomy",
      direction: "increase",
      strength: "weak",
      evidence: "behavioral",
    },
    {
      trait: "autonomy",
      direction: "decrease",
      strength: "strong",
      evidence: "explicit",
    },
  ]);

  assert.equal(
    resolvePersonalAgentPolicy(next).traits.autonomy,
    DEFAULT_AGENT_POLICY.autonomy - 0.24,
  );
  assert.equal(
    next.learning.find((x) => x.key === "agent_policy:autonomy")?.samples,
    1,
  );
});

test(
  "agent context contains effective per-user policy alongside user knowledge",
  () => {
    const state = applyAgentPolicySignals(emptyState(), [
      {
        trait: "verbosity",
        direction: "increase",
        strength: "strong",
        evidence: "explicit",
      },
    ]);
    const context = buildAgentContext(state, {
      now: new Date("2026-09-08T18:00:00.000Z"),
    });

    assert.equal(context.agentPolicy.preset, "proactive_v1");
    assert.ok(
      context.agentPolicy.traits.verbosity > DEFAULT_AGENT_POLICY.verbosity,
    );
  },
);

test(
  "agent decision parser accepts policy signals and isolates invalid ones",
  () => {
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

    assert.equal(parsed.decision.policySignals.length, 1);
    assert.ok(parsed.parseWarnings.includes("policy_signal_invalid"));
  },
);
