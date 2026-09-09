/**
 * @deprecated Trait-dictionary Personal Agent Policy.
 *
 * Production path no longer:
 * - accumulates policySignals into state.learning
 * - resolves numeric traits into directives for runtime context
 *
 * PERSONAL_AGENT_POLICY_INSTRUCTIONS remains wired temporarily until the
 * product-owned Guide prompt text is supplied. Do not invent replacement prose.
 *
 * Existing `agent_policy:*` learning rows (if any) are left untouched — no
 * automatic conversion to Personal Agent Guide text.
 */
import type { AppState } from "@/lib/model";

/** @deprecated */
export const AGENT_POLICY_TRAITS = [
  "autonomy",
  "clarificationAversion",
  "assumptionTolerance",
  "initiative",
  "timePrecision",
  "planningAmbition",
  "reminderSensitivity",
  "verbosity",
] as const;

/** @deprecated */
export type AgentPolicyTrait = (typeof AGENT_POLICY_TRAITS)[number];

/** @deprecated */
export type AgentPolicySignal = {
  trait: AgentPolicyTrait;
  direction: "increase" | "decrease";
  strength: "weak" | "medium" | "strong";
  evidence: "explicit" | "behavioral";
};

/** @deprecated */
export const DEFAULT_AGENT_POLICY_PRESET = "proactive_v1" as const;

/** @deprecated */
export const DEFAULT_AGENT_POLICY: Record<AgentPolicyTrait, number> = {
  autonomy: 0.78,
  clarificationAversion: 0.8,
  assumptionTolerance: 0.68,
  initiative: 0.72,
  timePrecision: 0.5,
  planningAmbition: 0.52,
  reminderSensitivity: 0.55,
  verbosity: 0.24,
};

const POLICY_KEY_PREFIX = "agent_policy:";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function learnedValue(state: AppState, trait: AgentPolicyTrait) {
  const hit = state.learning.find(
    (x) => x.kind === "correction" && x.key === `${POLICY_KEY_PREFIX}${trait}`,
  );
  const value = hit?.payload.value;
  return typeof value === "number" && Number.isFinite(value)
    ? clamp01(value)
    : DEFAULT_AGENT_POLICY[trait];
}

function confidenceFor(state: AppState, trait: AgentPolicyTrait) {
  const hit = state.learning.find(
    (x) => x.kind === "correction" && x.key === `${POLICY_KEY_PREFIX}${trait}`,
  );
  return hit?.confidence ?? "low";
}

/**
 * @deprecated Read-only helper for tests / migration audits.
 * Not placed in AgentRuntimeContext production payload.
 */
export function resolvePersonalAgentPolicy(state: AppState) {
  const traits = Object.fromEntries(
    AGENT_POLICY_TRAITS.map((trait) => [trait, learnedValue(state, trait)]),
  ) as Record<AgentPolicyTrait, number>;

  const confidence = Object.fromEntries(
    AGENT_POLICY_TRAITS.map((trait) => [trait, confidenceFor(state, trait)]),
  ) as Record<AgentPolicyTrait, "low" | "medium" | "high">;

  return {
    deprecated: true as const,
    preset: DEFAULT_AGENT_POLICY_PRESET,
    traits,
    confidence,
    directives: [] as string[],
  };
}

/**
 * @deprecated No-op on production path — does not write trait learning.
 * Legacy `agent_policy:*` rows in state.learning are preserved as-is.
 */
export function applyAgentPolicySignals(
  state: AppState,
  _signals: AgentPolicySignal[],
  _now = new Date(),
): AppState {
  return state;
}

/**
 * @deprecated Temporary instruction block until product Guide prompts ship.
 * Wired in orchestration only; trait learning is disconnected.
 * Do not rewrite this prose in infrastructure work.
 */
export const PERSONAL_AGENT_POLICY_INSTRUCTIONS = `

# PERSONAL AGENT POLICY — HOW TO WORK WITH THIS USER

The context contains \`agentPolicy\`. It controls HOW you work with this user; it is not factual knowledge about their household.
The global system rules remain hard safety/data constraints. Within those constraints, follow \`agentPolicy.directives\` and traits.

Important distinction:
- A required technical field tells you what the app ultimately needs.
- It does NOT automatically mean you must ask the user for that field.
- First use the current message, \`workingMemory\`, conversation context, saved knowledge and the user's personal agent policy.
- If a safe, reversible assumption is allowed by the policy, you may choose it and continue.
- Ask only when the remaining ambiguity can materially change the outcome, is risky/irreversible, or the personal policy prefers precision.
- If \`workingMemory\` has open loops or \`lastAgentQuestion\`, interpret the current message first as a possible answer/continuation. Do not restart from zero.

Do not turn examples from one user into universal rules. The default policy is merely a starting preset and may evolve differently for every user.

## Learning how this user wants the agent to behave

Return \`policySignals\` only when the current turn provides meaningful evidence about HOW the user wants you to operate.
Each signal is:
{ trait, direction, strength, evidence }

Allowed traits:
- autonomy
- clarificationAversion
- assumptionTolerance
- initiative
- timePrecision
- planningAmbition
- reminderSensitivity
- verbosity

Use \`evidence: "explicit"\` only for a clear preference/correction such as "don't keep asking me, just choose".
Use \`evidence: "behavioral"\` for weaker interaction evidence; keep it weak/medium and do not overlearn from one event.
If there is no meaningful evidence, return an empty array.
Never infer sensitive personal attributes from policy learning.

There is ONE personal agent. Never delegate the turn to another reasoning agent or create agent-to-agent chains. Domain engines are deterministic tools/validators, not agents.
`;
