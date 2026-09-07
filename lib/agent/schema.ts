import { z } from "zod";
import { Action, ActionSchema } from "../model";

export const AgentActionSchema = ActionSchema.options.filter(
  (x) =>
    ![
      "profile.update",
      "history.clear",
      "message.add",
      "template.exclude",
      "template.restore",
      "operation.record",
      "plan.set",
      "plan.clear",
      "plan.itemUpdate",
      "suggestion.record",
      "memory.lifeAdmin",
    ].includes(x.shape.type.value),
);

const AgentActionUnion = z.discriminatedUnion(
  "type",
  AgentActionSchema as [
    (typeof AgentActionSchema)[number],
    ...typeof AgentActionSchema,
  ],
);

export const ClarificationSchema = z.object({
  question: z.string().min(1).max(500),
  unresolvedPart: z.string().max(500).nullable(),
});

export const AgentProposalSchema = z.object({
  summary: z.string().min(1).max(800),
  reason: z.enum([
    "ai_invented_plan",
    "bulk_change",
    "schedule_shift",
    "shopping_derived",
    "destructive",
    "other",
  ]),
  proposedActions: z.array(AgentActionUnion).max(20),
});

export const AgentDecisionSchema = z.object({
  reply: z.string().min(1).max(4000),
  explicitActions: z.array(AgentActionUnion).max(20),
  clarification: ClarificationSchema.nullable(),
  proposal: AgentProposalSchema.nullable(),
  affectsToday: z.boolean(),
});

/** @deprecated Prefer AgentDecisionSchema — kept for gradual test migration helpers */
export const AgentOutput = AgentDecisionSchema;

export type AgentDecision = z.infer<typeof AgentDecisionSchema>;
export type AgentProposal = z.infer<typeof AgentProposalSchema>;

export type ActionPolicyBucket = "auto" | "proposal" | "drop";

export function classifyActionPolicy(
  action: Action,
  opts: { userExplicitBulk?: boolean } = {},
): ActionPolicyBucket {
  if (
    action.type === "task.status" &&
    (action.status === "cancelled" || action.status === "unknown")
  )
    return "proposal";
  if (
    action.type === "fact.remove" ||
    action.type === "shopping.remove" ||
    action.type === "history.clear"
  )
    return "proposal";
  if (opts.userExplicitBulk) return "proposal";
  return "auto";
}

export function partitionActionsByPolicy(actions: Action[]) {
  const auto: Action[] = [];
  const proposal: Action[] = [];
  for (const action of actions) {
    const bucket = classifyActionPolicy(action);
    if (bucket === "auto") auto.push(action);
    else if (bucket === "proposal") proposal.push(action);
  }
  if (auto.filter((a) => a.type !== "message.add").length > 5) {
    return { auto: [] as Action[], proposal: [...auto, ...proposal] };
  }
  return { auto, proposal };
}

export type IsolatedDecision = {
  decision: AgentDecision;
  rejectedActions: unknown[];
  parseWarnings: string[];
};

/**
 * Parse model JSON with per-action isolation: one bad action does not drop the reply or siblings.
 */
export function parseAgentDecisionIsolated(raw: unknown): IsolatedDecision {
  const warnings: string[] = [];
  const rejected: unknown[] = [];

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("agent_output_not_object");
  }
  const obj = raw as Record<string, unknown>;

  const reply =
    typeof obj.reply === "string" && obj.reply.trim()
      ? obj.reply.trim().slice(0, 4000)
      : null;
  if (!reply) throw new Error("agent_reply_missing");

  const affectsToday = Boolean(obj.affectsToday);

  let clarification: AgentDecision["clarification"] = null;
  if (obj.clarification != null) {
    const c = ClarificationSchema.safeParse(obj.clarification);
    if (c.success) clarification = c.data;
    else warnings.push("clarification_invalid");
  }

  let proposal: AgentDecision["proposal"] = null;
  if (obj.proposal != null && typeof obj.proposal === "object") {
    const pRaw = obj.proposal as Record<string, unknown>;
    const proposedRaw = Array.isArray(pRaw.proposedActions)
      ? pRaw.proposedActions
      : [];
    const proposedActions: Action[] = [];
    for (const item of proposedRaw) {
      const parsed = AgentActionUnion.safeParse(item);
      if (parsed.success) proposedActions.push(parsed.data);
      else rejected.push(item);
    }
    const head = z
      .object({
        summary: z.string().min(1).max(800),
        reason: z.enum([
          "ai_invented_plan",
          "bulk_change",
          "schedule_shift",
          "shopping_derived",
          "destructive",
          "other",
        ]),
      })
      .safeParse({ summary: pRaw.summary, reason: pRaw.reason ?? "other" });
    if (head.success)
      proposal = {
        summary: head.data.summary,
        reason: head.data.reason,
        proposedActions,
      };
    else warnings.push("proposal_invalid");
  }

  const explicitRaw = Array.isArray(obj.explicitActions)
    ? obj.explicitActions
    : Array.isArray(obj.actions)
      ? obj.actions
      : [];
  const explicitActions: Action[] = [];
  for (const item of explicitRaw) {
    const parsed = AgentActionUnion.safeParse(item);
    if (parsed.success) {
      try {
        // Dry structural acceptance already done; keep action
        explicitActions.push(parsed.data);
      } catch {
        rejected.push(item);
      }
    } else {
      rejected.push(item);
      warnings.push("action_rejected");
    }
  }

  const decision: AgentDecision = {
    reply,
    explicitActions,
    clarification,
    proposal,
    affectsToday,
  };

  return { decision, rejectedActions: rejected, parseWarnings: warnings };
}

export function parseAgentDecisionText(text: string): IsolatedDecision {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new Error("agent_invalid_json");
  }
  return parseAgentDecisionIsolated(json);
}

/** JSON Schema for OpenAI strict structured output (top-level object). */
export function agentDecisionJsonSchema() {
  const base = z.toJSONSchema(AgentDecisionSchema, {
    target: "draft-7",
  }) as Record<string, unknown>;
  // Ensure root is suitable for Responses API
  delete base.$schema;
  return base;
}
