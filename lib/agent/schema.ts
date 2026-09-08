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
    "new_tasks",
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

/**
 * Normalize common LLM field aliases before Action Zod parse.
 * This is schema compatibility — not natural-language understanding.
 */
export function normalizeLooseAgentAction(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const a = { ...(raw as Record<string, unknown>) };

  // Model sometimes emits { "task.status": "<uuid>", status: "done" }
  // instead of { type: "task.status", id: "<uuid>", status: "done" }.
  if (a.type == null) {
    for (const key of Object.keys(a)) {
      if (!key.includes(".")) continue;
      const value = a[key];
      if (typeof value === "string") {
        a.type = key;
        if (a.id == null) a.id = value;
        delete a[key];
        break;
      }
    }
  }

  if (typeof a.taskId === "string" && a.id == null) a.id = a.taskId;
  if (typeof a.shoppingId === "string" && a.id == null) a.id = a.shoppingId;
  if (typeof a.reminderId === "string" && a.id == null) a.id = a.reminderId;
  if (typeof a.factId === "string" && a.id == null) a.id = a.factId;
  if (typeof a.memberId === "string" && a.id == null) a.id = a.memberId;
  if (
    a.status === "completed" ||
    a.status === "complete" ||
    a.status === "finished"
  )
    a.status = "done";
  if (a.status === "canceled") a.status = "cancelled";
  if (a.type === "task.complete" || a.type === "task.completed") {
    a.type = "task.status";
    if (a.status == null) a.status = "done";
  }
  if (a.type === "task.defer_until") a.type = "task.deferUntil";
  if (a.type === "reminder.create" || a.type === "reminder.set")
    a.type = "reminder.add";
  if (
    (a.type === "reminder.add" || a.type === "shopping.add") &&
    typeof a.text === "string" &&
    a.title == null
  )
    a.title = a.text;
  if (a.type === "reminder.add" && a.taskId === undefined) a.taskId = null;
  if (
    a.type === "task.deferUntil" &&
    typeof a.dueAt === "string" &&
    a.hiddenUntil == null
  ) {
    a.hiddenUntil = a.dueAt;
    delete a.dueAt;
  }
  if (
    a.type === "shopping.add" &&
    typeof a.id === "string" &&
    !/^[0-9a-f-]{36}$/i.test(a.id)
  ) {
    delete a.id;
  }
  if (
    a.type === "shopping.add" &&
    typeof a.item === "string" &&
    a.title == null
  )
    a.title = a.item;
  if (a.type === "reminder.add" && typeof a.at === "string" && a.dueAt == null)
    a.dueAt = a.at;
  if (a.type === "fact.add") {
    if (typeof a.id === "string" && a.id.startsWith("forecast:")) {
      if (typeof a.text !== "string" || !a.text.startsWith("forecast:"))
        a.text = a.id;
      delete a.id;
    } else if (typeof a.id === "string" && !/^[0-9a-f-]{36}$/i.test(a.id)) {
      delete a.id;
    }
    if (a.kind == null) a.kind = "inference";
    if (a.expiresAt === undefined) a.expiresAt = null;
  }
  return a;
}

export function classifyActionPolicy(
  action: Action,
  opts: { userExplicitBulk?: boolean } = {},
): ActionPolicyBucket {
  // Chat-extracted new tasks always need Preview confirmation (never autoApply).
  if (action.type === "task.create") return "proposal";
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

/** True when chat must show a confirmation Preview (e.g. new tasks). */
export function chatActionsNeedProposal(actions: Action[]): boolean {
  return actions.some((a) => classifyActionPolicy(a) === "proposal");
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
      const parsed = AgentActionUnion.safeParse(
        normalizeLooseAgentAction(item),
      );
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
          "new_tasks",
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
    const parsed = AgentActionUnion.safeParse(normalizeLooseAgentAction(item));
    if (parsed.success) {
      explicitActions.push(parsed.data);
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

/** JSON Schema for OpenAI Responses API structured output. */
export function agentDecisionJsonSchema() {
  // OpenAI strict mode rejects `oneOf` inside array items (Zod discriminated unions).
  // Keep a compatible object schema and validate with AgentDecisionSchema after parse.
  return {
    type: "object",
    additionalProperties: true,
    properties: {
      reply: { type: "string" },
      explicitActions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            type: { type: "string" },
            id: { type: "string" },
            status: { type: "string" },
            title: { type: "string" },
            text: { type: "string" },
            dueAt: { type: "string" },
            task: { type: "object", additionalProperties: true },
          },
          required: ["type"],
        },
      },
      clarification: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            properties: {
              question: { type: "string" },
              unresolvedPart: { anyOf: [{ type: "string" }, { type: "null" }] },
            },
            required: ["question", "unresolvedPart"],
            additionalProperties: true,
          },
        ],
      },
      proposal: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            properties: {
              summary: { type: "string" },
              reason: { type: "string" },
              proposedActions: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
            },
            required: ["summary", "reason", "proposedActions"],
            additionalProperties: true,
          },
        ],
      },
      affectsToday: { type: "boolean" },
    },
    required: [
      "reply",
      "explicitActions",
      "clarification",
      "proposal",
      "affectsToday",
    ],
  } as Record<string, unknown>;
}
