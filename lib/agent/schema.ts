import { z } from "zod";
import {
  Action,
  ActionSchema,
  AgentWorkingMemoryPatchSchema,
  ProfileSchema,
} from "../model";
import { CATEGORY_IDS } from "../taxonomy";
import {
  AGENT_CAPABILITY_TYPES,
  SAFE_AGENT_PROFILE_FIELDS,
} from "./capabilities";
import { FORECAST_USER_INTENT } from "./forecast-intent";
import { DEEP_ACCESS_TOOLS } from "./deep-access";

export const DeepAccessRequestSchema = z.object({
  tool: z.enum(DEEP_ACCESS_TOOLS),
  entityId: z.string().min(1).max(80).optional(),
  query: z
    .object({
      status: z.array(z.string()).max(8).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      since: z.string().max(40).optional(),
      cursor: z.string().min(1).max(80).optional(),
      before: z.string().max(40).optional(),
      after: z.string().max(40).optional(),
      compact: z.boolean().optional(),
      text: z.string().max(200).optional(),
    })
    .optional(),
});

export const AgentPresentationSchema = z.object({
  taskIds: z.array(z.string().min(1).max(80)).max(40),
});

const INTERNAL_AGENT_ACTION_TYPES = new Set([
  "history.clear",
  "message.add",
  "operation.record",
  "plan.set",
  "plan.clear",
  "plan.itemUpdate",
  "memory.compact",
  "suggestion.record",
  "memory.lifeAdmin",
  "pendingIntent.set",
  "pendingIntent.clear",
  "workingMemory.patch",
  "workingMemory.clear",
  "durationFeedback.markAsked",
  "scan.set",
]);

const AgentProfileUpdateSchema = z.object({
  type: z.literal("profile.update"),
  patch: ProfileSchema.pick({
    name: true,
    addressAs: true,
    rooms: true,
    bathrooms: true,
    children: true,
    garden: true,
    pets: true,
    car: true,
    dishwasher: true,
    dryer: true,
    householdRoutines: true,
    cleaner: true,
  })
    .partial()
    .refine((patch) => Object.keys(patch).length > 0, "empty_profile_patch"),
});

/** Closed application hands. This is not a taxonomy of user meanings. */
export const AgentActionSchema = [
  ...ActionSchema.options.filter(
    (x) =>
      !INTERNAL_AGENT_ACTION_TYPES.has(x.shape.type.value) &&
      x.shape.type.value !== "profile.update",
  ),
  AgentProfileUpdateSchema,
];

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
  /** Conversational response before persistence. Execution confirmation is server-grounded. */
  reply: z.string().min(1).max(4000),
  explicitActions: z.array(AgentActionUnion).max(20),
  clarification: ClarificationSchema.nullable(),
  proposal: AgentProposalSchema.nullable(),
  affectsToday: z.boolean(),
  /**
   * Grounding of lasting mutations in this turn.
   * agent_inferred = inferred need/forecast; code forces Proposal before persist.
   * user_requested = explicit user instruction; regular capability policy applies.
   * Parser fail-closes to agent_inferred when omitted.
   */
  initiative: z.enum(["user_requested", "agent_inferred"]).optional(),
  /**
   * Read-only doors to open before a final decision. Intermediate rounds
   * must not persist actions; the server executes requests and continues
   * the same Turn.
   */
  deepAccessRequests: z.array(DeepAccessRequestSchema).max(4).optional().nullable(),
  /**
   * Non-persistent display references. Not an Action, Proposal, or source of truth.
   */
  presentation: AgentPresentationSchema.nullable().optional(),
  /**
   * First Scan structured draft for the review screen. Output only — not persistence.
   */
  scanDraft: z.unknown().nullable().optional(),
  /** Patch only when there is genuinely open conversational state. */
  workingMemoryUpdate: AgentWorkingMemoryPatchSchema.nullable().optional(),
  /** Optional indexes into proposal.proposedActions task.create list (0-based). */
  requestedTodayCreateIndexes: z
    .array(z.number().int().min(0).max(19))
    .max(20)
    .optional(),
  proposalDecision: z
    .object({
      proposalId: z.string().uuid(),
      decision: z.enum(["approve", "reject", "revise"]),
    })
    .nullable()
    .optional(),
  compactedMemoryUpdate: z
    .object({
      facts: z.array(z.string().max(500)).max(100),
      preferences: z.array(z.string().max(500)).max(100),
      patterns: z.array(z.string().max(500)).max(100),
    })
    .nullable()
    .optional(),
});

/** @deprecated Prefer AgentDecisionSchema. */
export const AgentOutput = AgentDecisionSchema;

export type AgentDecision = z.infer<typeof AgentDecisionSchema>;
export type AgentProposal = z.infer<typeof AgentProposalSchema>;
export type ActionPolicyBucket = "auto" | "proposal" | "drop";

function safeProfilePatch(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const patch = raw as Record<string, unknown>;
  const safe = new Set<string>(SAFE_AGENT_PROFILE_FIELDS);
  return Object.fromEntries(
    Object.entries(patch).filter(([key]) => safe.has(key)),
  );
}

/** Schema/field compatibility only; never natural-language interpretation. */
export function normalizeLooseAgentAction(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const a = { ...(raw as Record<string, unknown>) };

  if (a.type === "inventory.event") {
    const eventType = a.eventType;
    const subject = typeof a.subject === "string" ? a.subject.trim() : "";
    if (
      (eventType === "replenishment" ||
        eventType === "depletion" ||
        eventType === "correction") &&
      subject
    ) {
      return {
        type: "fact.add",
        text: `forecast:${eventType}:${subject}`,
        kind: "inference",
        expiresAt: null,
      };
    }
    return a;
  }

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
  if (typeof a.routineId === "string" && a.id == null) a.id = a.routineId;
  if (typeof a.shoppingId === "string" && a.id == null) a.id = a.shoppingId;
  if (typeof a.reminderId === "string" && a.id == null) a.id = a.reminderId;
  if (typeof a.factId === "string" && a.id == null) a.id = a.factId;
  if (typeof a.memberId === "string" && a.id == null) a.id = a.memberId;
  if (typeof a.homeAreaId === "string" && a.id == null) a.id = a.homeAreaId;

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
    typeof a.item === "string" &&
    a.title == null
  )
    a.title = a.item;
  if (a.type === "reminder.add" && typeof a.at === "string" && a.dueAt == null)
    a.dueAt = a.at;

  if (a.type === "agentGuide.update") {
    const g =
      a.guide !== null && typeof a.guide === "object" && !Array.isArray(a.guide)
        ? (a.guide as Record<string, unknown>)
        : null;
    if (g) {
      if (a.expectedRevision == null) a.expectedRevision = g.expectedRevision;
      if (a.currentRevision == null && g.currentRevision != null)
        a.currentRevision = g.currentRevision;
      if (typeof a.text !== "string" && typeof g.text === "string")
        a.text = g.text;
    }
    if (a.expectedRevision == null && a.currentRevision != null)
      a.expectedRevision = a.currentRevision;
    if (typeof a.expectedRevision === "string") {
      const n = Number(a.expectedRevision);
      if (Number.isInteger(n) && n >= 0) a.expectedRevision = n;
    }
    if (typeof a.text !== "string" && typeof a.title === "string")
      a.text = a.title;
  }

  if (a.type === "profile.update") {
    const safePatch = safeProfilePatch(a.patch);
    // Protected settings are not agent capabilities.
    if (Object.keys(safePatch).length === 0) a.patch = null;
    else a.patch = safePatch;
  }

  if (a.type === "task.create") {
    const task =
      a.task && typeof a.task === "object" && !Array.isArray(a.task)
        ? { ...(a.task as Record<string, unknown>) }
        : {};
    if (typeof a.title === "string" && typeof task.title !== "string")
      task.title = a.title;
    if (typeof a.text === "string" && typeof task.title !== "string")
      task.title = a.text;
    if (task.kind == null) task.kind = "task";
    a.task = task;
    delete a.title;
    delete a.text;
  }

  if (a.type === "routine.create") {
    const routine =
      a.routine && typeof a.routine === "object" && !Array.isArray(a.routine)
        ? { ...(a.routine as Record<string, unknown>) }
        : {};
    for (const key of [
      "title",
      "categoryId",
      "detailTypeId",
      "schedule",
      "timeOfDay",
      "atTime",
      "workMinutes",
      "effort",
      "priority",
      "notes",
      "sourceFactId",
      "relatedMemberIds",
      "homeAreaIds",
    ]) {
      if (routine[key] == null && a[key] != null) routine[key] = a[key];
    }
    a.routine = routine;
  }

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

export type AgentInitiative = "user_requested" | "agent_inferred";

const EPHEMERAL_AGENT_ACTION_TYPES = new Set([
  "message.add",
  "workingMemory.patch",
  "workingMemory.clear",
  "operation.record",
  "durationFeedback.markAsked",
]);

export function isLastingMutation(action: Action): boolean {
  return !EPHEMERAL_AGENT_ACTION_TYPES.has(action.type);
}

/** Fail closed: omitted initiative is treated as agent-inferred. */
export function resolveAgentInitiative(
  raw: unknown,
  message?: string,
): AgentInitiative {
  if (typeof message === "string" && message.trim() === FORECAST_USER_INTENT)
    return "agent_inferred";
  return raw === "user_requested" ? "user_requested" : "agent_inferred";
}

export function classifyActionPolicy(
  action: Action,
  opts: { userExplicitBulk?: boolean } = {},
): ActionPolicyBucket {
  if (action.type === "task.create") return "proposal";
  if (action.type === "agentGuide.update") return "proposal";
  if (
    action.type === "checklist.create" ||
    action.type === "checklist.update" ||
    action.type === "checklist.delete" ||
    action.type === "checklist.reset" ||
    action.type === "checklist.item.add" ||
    action.type === "checklist.item.update" ||
    action.type === "checklist.item.remove" ||
    action.type === "checklist.item.reorder"
  )
    return "proposal";
  if (
    action.type === "task.status" &&
    (action.status === "cancelled" || action.status === "unknown")
  )
    return "proposal";
  if (
    action.type === "fact.remove" ||
    action.type === "shopping.remove" ||
    action.type === "member.remove" ||
    action.type === "homeArea.remove" ||
    action.type === "routine.remove" ||
    action.type === "history.clear"
  )
    return "proposal";
  if (opts.userExplicitBulk) return "proposal";
  return "auto";
}

export function glueTaskScheduleActions(auto: Action[], proposal: Action[]) {
  const all = [...auto, ...proposal];
  const hasCreate = all.some((action) => action.type === "task.create");
  if (!hasCreate) return { auto, proposal };
  const sticky = (action: Action) =>
    action.type === "schedule.set" ||
    action.type === "schedule.remove" ||
    action.type === "schedule.replaceDay" ||
    action.type === "planning.set" ||
    action.type === "planning.clear";
  return {
    auto: auto.filter((action) => !sticky(action)),
    proposal: [...proposal, ...auto.filter(sticky)],
  };
}

export function chatActionsNeedProposal(actions: Action[]): boolean {
  return actions.some((a) => classifyActionPolicy(a) === "proposal");
}

export function partitionActionsByPolicy(
  actions: Action[],
  opts: { initiative?: AgentInitiative } = {},
) {
  const inferred = opts.initiative !== "user_requested";
  const auto: Action[] = [];
  const proposal: Action[] = [];
  for (const action of actions) {
    if (inferred && isLastingMutation(action)) {
      proposal.push(action);
      continue;
    }
    const bucket = classifyActionPolicy(action);
    if (bucket === "auto") auto.push(action);
    else if (bucket === "proposal") proposal.push(action);
  }
  if (auto.filter((a) => a.type !== "message.add").length > 5)
    return { auto: [] as Action[], proposal: [...auto, ...proposal] };
  return glueTaskScheduleActions(auto, proposal);
}

export type IsolatedDecision = {
  decision: AgentDecision;
  rejectedActions: unknown[];
  parseWarnings: string[];
};

function parseAgentAction(item: unknown) {
  return AgentActionUnion.safeParse(normalizeLooseAgentAction(item));
}

/** One malformed action does not destroy the reply or valid sibling actions. */
export function parseAgentDecisionIsolated(raw: unknown): IsolatedDecision {
  const warnings: string[] = [];
  const rejected: unknown[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("agent_output_not_object");

  const obj = raw as Record<string, unknown>;
  const reply =
    typeof obj.reply === "string" && obj.reply.trim()
      ? obj.reply.trim().slice(0, 4000)
      : null;
  if (!reply) throw new Error("agent_reply_missing");

  const affectsToday = Boolean(obj.affectsToday);
  let requestedTodayCreateIndexes: number[] | undefined;
  if (Array.isArray(obj.requestedTodayCreateIndexes)) {
    const idxs = obj.requestedTodayCreateIndexes
      .map((x) => (typeof x === "number" ? x : Number(x)))
      .filter((x) => Number.isInteger(x) && x >= 0 && x <= 19)
      .slice(0, 20);
    if (idxs.length) requestedTodayCreateIndexes = idxs;
  }

  let clarification: AgentDecision["clarification"] = null;
  if (obj.clarification != null) {
    const c = ClarificationSchema.safeParse(obj.clarification);
    if (c.success) clarification = c.data;
    else warnings.push("clarification_invalid");
  }

  let workingMemoryUpdate: AgentDecision["workingMemoryUpdate"] = null;
  if (
    obj.workingMemoryUpdate != null &&
    typeof obj.workingMemoryUpdate === "object" &&
    !Array.isArray(obj.workingMemoryUpdate)
  ) {
    const wm = AgentWorkingMemoryPatchSchema.safeParse(obj.workingMemoryUpdate);
    if (wm.success) workingMemoryUpdate = wm.data;
    else warnings.push("working_memory_update_invalid");
  }

  let proposal: AgentDecision["proposal"] = null;
  if (obj.proposal != null && typeof obj.proposal === "object") {
    const pRaw = obj.proposal as Record<string, unknown>;
    const proposedRaw = Array.isArray(pRaw.proposedActions)
      ? pRaw.proposedActions
      : [];
    const proposedActions: Action[] = [];
    for (const item of proposedRaw) {
      const parsed = parseAgentAction(item);
      if (parsed.success) proposedActions.push(parsed.data);
      else rejected.push(item);
    }
    const reasonAllowed = [
      "ai_invented_plan",
      "bulk_change",
      "schedule_shift",
      "shopping_derived",
      "destructive",
      "new_tasks",
      "other",
    ] as const;
    const reasonRaw = typeof pRaw.reason === "string" ? pRaw.reason : "other";
    const reason = (reasonAllowed as readonly string[]).includes(reasonRaw)
      ? reasonRaw
      : proposedActions.some((a) => a.type === "task.create")
        ? "new_tasks"
        : "other";
    const head = z
      .object({
        summary: z.string().min(1).max(800),
        reason: z.enum(reasonAllowed),
      })
      .safeParse({ summary: pRaw.summary, reason });
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
    const parsed = parseAgentAction(item);
    if (parsed.success) explicitActions.push(parsed.data);
    else {
      rejected.push(item);
      warnings.push("action_rejected");
    }
  }

  const initiative = resolveAgentInitiative(obj.initiative);

  let deepAccessRequests: AgentDecision["deepAccessRequests"] = [];
  if (Array.isArray(obj.deepAccessRequests)) {
    const parsedReqs = obj.deepAccessRequests
      .map((item) => DeepAccessRequestSchema.safeParse(item))
      .slice(0, 4);
    deepAccessRequests = parsedReqs
      .filter((p) => p.success)
      .map((p) => p.data);
    if (parsedReqs.some((p) => !p.success))
      warnings.push("deep_access_requests_invalid");
  }

  let proposalDecision: AgentDecision["proposalDecision"] = null;
  if (obj.proposalDecision != null) {
    const parsed = z
      .object({
        proposalId: z.string().uuid(),
        decision: z.enum(["approve", "reject", "revise"]),
      })
      .safeParse(obj.proposalDecision);
    if (parsed.success) proposalDecision = parsed.data;
    else warnings.push("proposal_decision_invalid");
  }

  let compactedMemoryUpdate: AgentDecision["compactedMemoryUpdate"] = null;
  if (obj.compactedMemoryUpdate != null) {
    const parsed = z
      .object({
        facts: z.array(z.string().max(500)).max(100),
        preferences: z.array(z.string().max(500)).max(100),
        patterns: z.array(z.string().max(500)).max(100),
      })
      .safeParse(obj.compactedMemoryUpdate);
    if (parsed.success) compactedMemoryUpdate = parsed.data;
    else warnings.push("compacted_memory_update_invalid");
  }

  let presentation: AgentDecision["presentation"] = null;
  if (obj.presentation != null && typeof obj.presentation === "object") {
    const parsed = AgentPresentationSchema.safeParse(obj.presentation);
    if (parsed.success) presentation = parsed.data;
    else warnings.push("presentation_invalid");
  }

  let scanDraft: AgentDecision["scanDraft"] = null;
  if (obj.scanDraft != null && typeof obj.scanDraft === "object") {
    scanDraft = obj.scanDraft;
  }

  return {
    decision: {
      reply,
      explicitActions,
      clarification,
      proposal,
      affectsToday,
      initiative,
      deepAccessRequests,
      presentation,
      scanDraft,
      workingMemoryUpdate,
      requestedTodayCreateIndexes,
      proposalDecision,
      compactedMemoryUpdate,
    },
    rejectedActions: rejected,
    parseWarnings: warnings,
  };
}

export function parseAgentDecisionText(text: string): IsolatedDecision {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return parseAgentDecisionIsolated(JSON.parse(cleaned) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("agent_invalid_json");
    throw error;
  }
}

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const stringArray = { type: "array", items: { type: "string" } };
const scheduleSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    frequency: {
      type: "string",
      enum: ["daily", "weekly", "monthly", "interval_days"],
    },
    interval: { type: "integer", minimum: 1, maximum: 30 },
    weekdays: {
      type: "array",
      minItems: 1,
      maxItems: 7,
      items: { type: "integer", minimum: 0, maximum: 6 },
    },
    dayOfMonth: { type: "integer", minimum: 1, maximum: 31 },
    everyDays: { type: "integer", minimum: 1, maximum: 366 },
  },
  required: ["frequency"],
};

const routineFields = {
  id: { type: "string" },
  title: { type: "string" },
  categoryId: { type: "string", enum: [...CATEGORY_IDS] },
  detailTypeId: nullableString,
  schedule: scheduleSchema,
  timeOfDay: {
    type: "string",
    enum: ["any", "morning", "afternoon", "evening"],
  },
  atTime: nullableString,
  workMinutes: { type: "integer", minimum: 1, maximum: 1440 },
  effort: { type: "integer", minimum: 1, maximum: 3 },
  priority: { type: "integer", minimum: 0, maximum: 3 },
  notes: { type: "string" },
  sourceFactId: nullableString,
  relatedMemberIds: stringArray,
  homeAreaIds: stringArray,
};

function actionJsonSchema() {
  return {
    type: "object",
    additionalProperties: true,
    properties: {
      type: { type: "string", enum: [...AGENT_CAPABILITY_TYPES] },
      id: { type: "string" },
      taskId: nullableString,
      routineId: nullableString,
      stepId: { type: "string" },
      paused: { type: "boolean" },
      status: {
        type: "string",
        enum: ["open", "done", "cancelled", "unknown", "in_progress"],
      },
      title: { type: "string" },
      text: {
        type: "string",
        description:
          "For agentGuide.update: the full replacement Personal Agent Guide in the user's language.",
      },
      expectedRevision: {
        type: "integer",
        minimum: 0,
        description:
          "For agentGuide.update: the current Personal Agent Guide revision being replaced. Copy runtime.personalAgentGuide.update.expectedRevision as-is. Do not add 1. Use 0 when exists is false.",
      },
      currentRevision: {
        type: "integer",
        minimum: 0,
        description:
          "Alias for expectedRevision on agentGuide.update — current revision, not the next one.",
      },
      guide: {
        type: "object",
        additionalProperties: true,
        description:
          "Optional nested payload for agentGuide.update. Preferred when type is agentGuide.update.",
        properties: {
          expectedRevision: {
            type: "integer",
            minimum: 0,
            description:
              "Current revision being replaced. Copy as-is. Do not add 1.",
          },
          currentRevision: {
            type: "integer",
            minimum: 0,
            description: "Alias for expectedRevision — current, not next.",
          },
          text: {
            type: "string",
            description: "Full replacement Personal Agent Guide text.",
          },
        },
        required: ["expectedRevision", "text"],
      },
      sourceTurnId: nullableString,
      proposalId: nullableString,
      quantity: { type: "string" },
      checked: { type: "boolean" },
      checklistId: { type: "string" },
      itemId: { type: "string" },
      itemIds: stringArray,
      order: { type: "integer", minimum: 0, maximum: 80 },
      items: {
        type: "array",
        maxItems: 80,
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            id: { type: "string" },
            text: { type: "string" },
            checked: { type: "boolean" },
            order: { type: "integer", minimum: 0, maximum: 80 },
          },
          required: ["text"],
        },
      },
      dueAt: { type: "string" },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      plannedStart: nullableString,
      plannedEnd: nullableString,
      dayPart: {
        type: "string",
        enum: ["morning", "afternoon", "evening"],
      },
      createIndex: { type: "integer", minimum: 0, maximum: 19 },
      hiddenUntil: { type: "string" },
      urgency: { type: "string", enum: ["urgent", "medium", "low"] },
      eventType: {
        type: "string",
        enum: ["replenishment", "depletion", "correction"],
      },
      subject: { type: "string" },
      task: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          categoryId: { type: "string", enum: [...CATEGORY_IDS] },
          detailTypeId: nullableString,
          kind: { type: "string", enum: ["task", "idea"] },
          dueAt: nullableString,
          workMinutes: { type: "integer", minimum: 1, maximum: 1440 },
          waitMinutes: { type: "integer", minimum: 0, maximum: 1440 },
          effort: { type: "integer", minimum: 1, maximum: 3 },
          priority: { type: "integer", minimum: 0, maximum: 3 },
          recurrenceDays: {
            anyOf: [
              { type: "integer", minimum: 1, maximum: 366 },
              { type: "null" },
            ],
          },
          routineId: nullableString,
          notes: { type: "string" },
          dependsOn: stringArray,
          relatedMemberIds: stringArray,
          homeAreaIds: stringArray,
        },
        required: ["title"],
      },
      routine: {
        type: "object",
        additionalProperties: true,
        properties: routineFields,
        required: ["title", "schedule"],
      },
      patch: {
        type: "object",
        additionalProperties: true,
        properties: {
          title: { type: "string" },
          categoryId: { type: "string", enum: [...CATEGORY_IDS] },
          detailTypeId: nullableString,
          kind: { type: "string", enum: ["task", "idea"] },
          dueAt: nullableString,
          workMinutes: { type: "integer", minimum: 1, maximum: 1440 },
          waitMinutes: { type: "integer", minimum: 0, maximum: 1440 },
          effort: { type: "integer", minimum: 1, maximum: 3 },
          priority: { type: "integer", minimum: 0, maximum: 3 },
          recurrenceDays: {
            anyOf: [
              { type: "integer", minimum: 1, maximum: 366 },
              { type: "null" },
            ],
          },
          routineId: nullableString,
          notes: { type: "string" },
          relatedMemberIds: stringArray,
          homeAreaIds: stringArray,
          urgency: { type: "string", enum: ["urgent", "medium", "low"] },
          schedule: scheduleSchema,
          timeOfDay: {
            type: "string",
            enum: ["any", "morning", "afternoon", "evening"],
          },
          atTime: nullableString,
          sourceFactId: nullableString,
          name: { type: "string" },
          addressAs: {
            type: "string",
            enum: ["feminine", "masculine", "neutral"],
          },
          rooms: { type: "integer", minimum: 1, maximum: 30 },
          bathrooms: { type: "integer", minimum: 1, maximum: 15 },
          children: { type: "integer", minimum: 0, maximum: 20 },
          garden: { type: "boolean" },
          pets: { type: "boolean" },
          car: { type: "boolean" },
          dishwasher: { type: "boolean" },
          dryer: { type: "boolean" },
          householdRoutines: { type: "object", additionalProperties: true },
          cleaner: { type: "object", additionalProperties: true },
        },
      },
      member: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string", enum: ["adult", "child", "pet", "other"] },
          aliases: stringArray,
        },
        required: ["name"],
      },
      area: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: {
            type: "string",
            enum: [
              "bedroom",
              "bathroom",
              "kids_room",
              "living",
              "kitchen",
              "guest_toilet",
              "other",
            ],
          },
          aliases: stringArray,
          parentAreaId: nullableString,
          source: { type: "string", enum: ["user", "scan", "agent"] },
        },
        required: ["name"],
      },
      constraint: {
        type: "object",
        additionalProperties: true,
        properties: {
          date: { type: "string" },
          availableFrom: nullableString,
          availableUntil: nullableString,
          unavailable: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          effort: {
            anyOf: [
              { type: "integer", minimum: 1, maximum: 3 },
              { type: "null" },
            ],
          },
          note: { type: "string" },
        },
        required: [
          "date",
          "availableFrom",
          "availableUntil",
          "unavailable",
          "effort",
          "note",
        ],
      },
    },
    required: ["type"],
  };
}

/** Structured-output contract: open language understanding, closed executable hands. */
export function agentDecisionJsonSchema() {
  const action = actionJsonSchema();
  return {
    type: "object",
    additionalProperties: true,
    properties: {
      reply: { type: "string" },
      initiative: {
        type: "string",
        enum: ["user_requested", "agent_inferred"],
      },
      explicitActions: { type: "array", maxItems: 20, items: action },
      clarification: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              question: { type: "string" },
              unresolvedPart: nullableString,
            },
            required: ["question", "unresolvedPart"],
          },
        ],
      },
      proposal: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: true,
            properties: {
              summary: { type: "string" },
              reason: {
                type: "string",
                enum: [
                  "ai_invented_plan",
                  "bulk_change",
                  "schedule_shift",
                  "shopping_derived",
                  "destructive",
                  "new_tasks",
                  "other",
                ],
              },
              proposedActions: { type: "array", maxItems: 20, items: action },
            },
            required: ["summary", "reason", "proposedActions"],
          },
        ],
      },
      affectsToday: { type: "boolean" },
      requestedTodayCreateIndexes: {
        type: "array",
        maxItems: 20,
        items: { type: "integer", minimum: 0, maximum: 19 },
      },
      deepAccessRequests: {
        anyOf: [
          { type: "null" },
          {
            type: "array",
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                tool: { type: "string", enum: [...DEEP_ACCESS_TOOLS] },
                entityId: { type: "string" },
                query: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    status: { type: "array", items: { type: "string" } },
                    limit: { type: "integer", minimum: 1, maximum: 100 },
                    since: { type: "string" },
                    cursor: { type: "string" },
                    before: { type: "string" },
                    after: { type: "string" },
                    compact: { type: "boolean" },
                    text: { type: "string" },
                  },
                },
              },
              required: ["tool"],
            },
          },
        ],
      },
      workingMemoryUpdate: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: true,
            properties: {
              objective: nullableString,
              contextSummary: nullableString,
              openLoops: {
                type: "array",
                maxItems: 8,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    summary: { type: "string" },
                    relevantEntityIds: stringArray,
                  },
                  required: ["summary", "relevantEntityIds"],
                },
              },
              lastAgentQuestion: nullableString,
              relevantEntityIds: stringArray,
              assumptions: {
                type: "array",
                maxItems: 12,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    text: { type: "string" },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                  },
                  required: ["text", "confidence"],
                },
              },
            },
          },
        ],
      },
      proposalDecision: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              proposalId: { type: "string" },
              decision: {
                type: "string",
                enum: ["approve", "reject", "revise"],
              },
            },
            required: ["proposalId", "decision"],
          },
        ],
      },
      presentation: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              taskIds: {
                type: "array",
                maxItems: 40,
                items: { type: "string" },
              },
            },
            required: ["taskIds"],
          },
        ],
      },
      scanDraft: {
        anyOf: [
          { type: "null" },
          { type: "object", additionalProperties: true },
        ],
      },
      compactedMemoryUpdate: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              facts: { type: "array", maxItems: 100, items: { type: "string" } },
              preferences: {
                type: "array",
                maxItems: 100,
                items: { type: "string" },
              },
              patterns: {
                type: "array",
                maxItems: 100,
                items: { type: "string" },
              },
            },
            required: ["facts", "preferences", "patterns"],
          },
        ],
      },
    },
    required: [
      "reply",
      "initiative",
      "explicitActions",
      "clarification",
      "proposal",
      "affectsToday",
      "workingMemoryUpdate",
    ],
  } as Record<string, unknown>;
}
