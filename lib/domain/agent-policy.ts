import type { AppState } from "@/lib/model";

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

export type AgentPolicyTrait = (typeof AGENT_POLICY_TRAITS)[number];
export type AgentPolicySignal = {
  trait: AgentPolicyTrait;
  direction: "increase" | "decrease";
  strength: "weak" | "medium" | "strong";
  evidence: "explicit" | "behavioral";
};

export const DEFAULT_AGENT_POLICY_PRESET = "proactive_v1" as const;

/**
 * Product default inspired by the desired Ira-style experience: proactive,
 * concise, context-first and reluctant to interrogate. This is a starting
 * point, not a claim about any individual user.
 */
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

function directives(traits: Record<AgentPolicyTrait, number>) {
  const out: string[] = [];

  if (traits.autonomy >= 0.65)
    out.push(
      "Prefer completing the user's goal with safe, reversible assumptions instead of turning the conversation into an interview.",
    );
  else
    out.push(
      "Prefer explicit confirmation before filling meaningful missing details.",
    );

  if (traits.clarificationAversion >= 0.65)
    out.push(
      "Ask a clarification only when the ambiguity can materially change the result; never re-ask a point already resolved by context or the current answer.",
    );
  else
    out.push(
      "When a meaningful ambiguity remains, ask one short targeted clarification.",
    );

  if (traits.assumptionTolerance >= 0.65)
    out.push(
      "When a required technical field is absent but can be inferred safely from a clear window/boundary/context, choose a reasonable reversible value and proceed.",
    );
  else
    out.push(
      "Do not fill missing technical fields unless the user's wording or stored context makes the value clear.",
    );

  if (traits.timePrecision >= 0.7)
    out.push(
      "Treat exact timing as important; resolve or ask for precision when different times would matter.",
    );
  else if (traits.timePrecision <= 0.35)
    out.push(
      "Accept natural time windows and practical boundaries without forcing exact-clock follow-ups when a safe choice is possible.",
    );

  if (traits.initiative >= 0.65)
    out.push(
      "Be proactive: use known tasks, household context and preferences to propose the next useful step without waiting for the user to manage the app.",
    );

  if (traits.planningAmbition <= 0.45)
    out.push(
      "Prefer realistic, lighter plans over filling every available minute.",
    );
  else if (traits.planningAmbition >= 0.7)
    out.push(
      "When feasible, build fuller plans while still respecting capacity and protected constraints.",
    );

  if (traits.reminderSensitivity <= 0.4)
    out.push("Avoid extra reminders unless clearly useful or explicitly requested.");
  else if (traits.reminderSensitivity >= 0.75)
    out.push("Lean toward helpful reminders when the user has shown they value them.");

  if (traits.verbosity <= 0.35)
    out.push("Keep replies concise unless detail is needed to complete the task.");
  else if (traits.verbosity >= 0.7)
    out.push("Give somewhat more explanation when it helps the user understand the decision.");

  return out;
}

export function resolvePersonalAgentPolicy(state: AppState) {
  const traits = Object.fromEntries(
    AGENT_POLICY_TRAITS.map((trait) => [trait, learnedValue(state, trait)]),
  ) as Record<AgentPolicyTrait, number>;

  const confidence = Object.fromEntries(
    AGENT_POLICY_TRAITS.map((trait) => [trait, confidenceFor(state, trait)]),
  ) as Record<AgentPolicyTrait, "low" | "medium" | "high">;

  return {
    preset: DEFAULT_AGENT_POLICY_PRESET,
    traits,
    confidence,
    directives: directives(traits),
  };
}

const strengthDelta = {
  explicit: { weak: 0.08, medium: 0.15, strong: 0.24 },
  behavioral: { weak: 0.02, medium: 0.04, strong: 0.07 },
} as const;

function signalRank(signal: AgentPolicySignal) {
  const evidence = signal.evidence === "explicit" ? 10 : 0;
  const strength = signal.strength === "strong" ? 3 : signal.strength === "medium" ? 2 : 1;
  return evidence + strength;
}

/**
 * Persist personal-agent learning inside the existing LearningInsight store.
 * At most one signal per trait is applied per turn, and behavioral evidence
 * moves the policy slowly. Explicit preferences can move it faster.
 */
export function applyAgentPolicySignals(
  state: AppState,
  signals: AgentPolicySignal[],
  now = new Date(),
): AppState {
  if (!signals.length) return state;

  const selected = new Map<AgentPolicyTrait, AgentPolicySignal>();
  for (const signal of signals) {
    const current = selected.get(signal.trait);
    if (!current || signalRank(signal) > signalRank(current))
      selected.set(signal.trait, signal);
  }

  let learning = [...state.learning];
  for (const signal of selected.values()) {
    const key = `${POLICY_KEY_PREFIX}${signal.trait}`;
    const index = learning.findIndex(
      (x) => x.kind === "correction" && x.key === key,
    );
    const existing = index >= 0 ? learning[index]! : null;
    const previousRaw = existing?.payload.value;
    const previous =
      typeof previousRaw === "number"
        ? clamp01(previousRaw)
        : DEFAULT_AGENT_POLICY[signal.trait];
    const delta = strengthDelta[signal.evidence][signal.strength];
    const value = clamp01(
      previous + (signal.direction === "increase" ? delta : -delta),
    );
    const samples = (existing?.samples ?? 0) + 1;
    const explicitSamples =
      (typeof existing?.payload.explicitSamples === "number"
        ? existing.payload.explicitSamples
        : 0) + (signal.evidence === "explicit" ? 1 : 0);
    const behavioralSamples =
      (typeof existing?.payload.behavioralSamples === "number"
        ? existing.payload.behavioralSamples
        : 0) + (signal.evidence === "behavioral" ? 1 : 0);
    const confidence: "low" | "medium" | "high" =
      samples >= 6 || explicitSamples >= 3
        ? "high"
        : samples >= 2 || (signal.evidence === "explicit" && signal.strength === "strong")
          ? "medium"
          : "low";

    const insight: AppState["learning"][number] = {
      id: existing?.id ?? crypto.randomUUID(),
      kind: "correction",
      key,
      payload: {
        source: "personal_agent_policy",
        preset: DEFAULT_AGENT_POLICY_PRESET,
        trait: signal.trait,
        value,
        explicitSamples,
        behavioralSamples,
        lastDirection: signal.direction,
      },
      samples,
      confidence,
      lastObservedAt: now.toISOString(),
    };

    if (index >= 0) learning[index] = insight;
    else learning = [insight, ...learning].slice(0, 300);
  }

  return { ...state, learning };
}

/**
 * Added to the single agent's system instructions. This is not a second agent
 * or a second model call; it teaches the same personal agent how to consume
 * its per-user policy and how to emit lightweight learning signals.
 */
export const PERSONAL_AGENT_POLICY_INSTRUCTIONS = `

# PERSONAL AGENT POLICY — HOW TO WORK WITH THIS USER

The context contains \`agentPolicy\`. It controls HOW you work with this user; it is not factual knowledge about their household.
The global system rules remain hard safety/data constraints. Within those constraints, follow \`agentPolicy.directives\` and traits.

Important distinction:
- A required technical field tells you what the app ultimately needs.
- It does NOT automatically mean you must ask the user for that field.
- First use the current message, pending intent, conversation context, saved knowledge and the user's personal agent policy.
- If a safe, reversible assumption is allowed by the policy, you may choose it and continue.
- Ask only when the remaining ambiguity can materially change the outcome, is risky/irreversible, or the personal policy prefers precision.
- If \`pendingAgentIntent\` exists, interpret the current message first as a possible answer/continuation of that intent. Do not restart the task from zero.

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
