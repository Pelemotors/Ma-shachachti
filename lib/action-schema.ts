import { z } from "zod";
import {
  ACTION_TYPES,
  type ActionResult,
  type ActionType,
  type AgentAction,
  type AgentProposal,
  type AgentPresentation,
} from "./types.ts";

import { DATE_RE, TIME_RE } from "./time.ts";

export { DATE_RE, TIME_RE };

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ISO_DATE_TIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export const ActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  due_on: z.string().regex(DATE_RE).nullable().optional(),
  due_time: z.string().regex(TIME_RE).nullable().optional(),
  due_patch: z.enum(["keep", "set", "clear"]).nullable().optional(),
  reminder_enabled: z.boolean().nullable().optional(),
  reminder_at: z.string().regex(ISO_DATE_TIME_RE).nullable().optional(),
  reminder_at_patch: z.enum(["keep", "set", "clear"]).nullable().optional(),
  reminder_offset_minutes: z
    .number()
    .int()
    .min(0)
    .max(10080)
    .nullable()
    .optional(),
  reminder_patch: z.enum(["keep", "set"]).nullable().optional(),
  plan_patch: z.enum(["keep", "set", "clear"]).nullable().optional(),
  planned_date: z.string().regex(DATE_RE).nullable().optional(),
  planned_start_time: z.string().regex(TIME_RE).nullable().optional(),
  planned_end_time: z.string().regex(TIME_RE).nullable().optional(),
  kind: z.enum(["preference", "fact"]).nullable().optional(),
  content: z.string().trim().min(1).max(500).nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]).nullable().optional(),
  silent: z.boolean().nullable().optional(),
}).strict();

function nullable(schema: Record<string, unknown>) {
  return { anyOf: [schema, { type: "null" }] };
}

export const AGENT_TURN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "reply",
    "actions",
    "proposal",
    "presentation",
    "consequence_updates",
  ],
  properties: {
    reply: { type: "string" },
    actions: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type",
          "id",
          "title",
          "notes",
          "due_on",
          "due_time",
          "due_patch",
          "reminder_enabled",
          "reminder_at",
          "reminder_at_patch",
          "reminder_offset_minutes",
          "reminder_patch",
          "plan_patch",
          "planned_date",
          "planned_start_time",
          "planned_end_time",
          "kind",
          "content",
          "confidence",
          "silent",
        ],
        properties: {
          type: {
            type: "string",
            enum: [...ACTION_TYPES],
          },
          id: nullable({ type: "string", pattern: UUID_RE.source }),
          title: nullable({ type: "string", minLength: 1, maxLength: 200 }),
          notes: nullable({ type: "string", maxLength: 2000 }),
          due_on: nullable({ type: "string", pattern: DATE_RE.source }),
          due_time: nullable({ type: "string", pattern: TIME_RE.source }),
          due_patch: nullable({
            type: "string",
            enum: ["keep", "set", "clear"],
          }),
          reminder_enabled: nullable({ type: "boolean" }),
          reminder_at: nullable({
            type: "string",
            pattern: ISO_DATE_TIME_RE.source,
          }),
          reminder_at_patch: nullable({
            type: "string",
            enum: ["keep", "set", "clear"],
          }),
          reminder_offset_minutes: nullable({
            type: "integer",
            minimum: 0,
            maximum: 10080,
          }),
          reminder_patch: nullable({
            type: "string",
            enum: ["keep", "set"],
          }),
          plan_patch: nullable({
            type: "string",
            enum: ["keep", "set", "clear"],
          }),
          planned_date: nullable({ type: "string", pattern: DATE_RE.source }),
          planned_start_time: nullable({
            type: "string",
            pattern: TIME_RE.source,
          }),
          planned_end_time: nullable({
            type: "string",
            pattern: TIME_RE.source,
          }),
          kind: nullable({ type: "string", enum: ["preference", "fact"] }),
          content: nullable({ type: "string", minLength: 1, maxLength: 500 }),
          confidence: nullable({
            type: "string",
            enum: ["low", "medium", "high"],
          }),
          silent: nullable({ type: "boolean" }),
        },
      },
    },
    proposal: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["summary", "actions", "expires_in_seconds"],
          properties: {
            summary: { type: "string", minLength: 1, maxLength: 500 },
            actions: {
              type: "array",
              minItems: 1,
              maxItems: 10,
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "type",
                  "id",
                  "title",
                  "notes",
                  "due_on",
                  "due_time",
                  "due_patch",
                  "reminder_enabled",
                  "reminder_at",
                  "reminder_at_patch",
                  "reminder_offset_minutes",
                  "reminder_patch",
                  "plan_patch",
                  "planned_date",
                  "planned_start_time",
                  "planned_end_time",
                  "kind",
                  "content",
                  "confidence",
                  "silent",
                ],
                properties: {
                  type: { type: "string", enum: [...ACTION_TYPES] },
                  id: nullable({ type: "string", pattern: UUID_RE.source }),
                  title: nullable({
                    type: "string",
                    minLength: 1,
                    maxLength: 200,
                  }),
                  notes: nullable({ type: "string", maxLength: 2000 }),
                  due_on: nullable({
                    type: "string",
                    pattern: DATE_RE.source,
                  }),
                  due_time: nullable({
                    type: "string",
                    pattern: TIME_RE.source,
                  }),
                  due_patch: nullable({
                    type: "string",
                    enum: ["keep", "set", "clear"],
                  }),
                  reminder_enabled: nullable({ type: "boolean" }),
                  reminder_at: nullable({
                    type: "string",
                    pattern: ISO_DATE_TIME_RE.source,
                  }),
                  reminder_at_patch: nullable({
                    type: "string",
                    enum: ["keep", "set", "clear"],
                  }),
                  reminder_offset_minutes: nullable({
                    type: "integer",
                    minimum: 0,
                    maximum: 10080,
                  }),
                  reminder_patch: nullable({
                    type: "string",
                    enum: ["keep", "set"],
                  }),
                  plan_patch: nullable({
                    type: "string",
                    enum: ["keep", "set", "clear"],
                  }),
                  planned_date: nullable({
                    type: "string",
                    pattern: DATE_RE.source,
                  }),
                  planned_start_time: nullable({
                    type: "string",
                    pattern: TIME_RE.source,
                  }),
                  planned_end_time: nullable({
                    type: "string",
                    pattern: TIME_RE.source,
                  }),
                  kind: nullable({
                    type: "string",
                    enum: ["preference", "fact"],
                  }),
                  content: nullable({
                    type: "string",
                    minLength: 1,
                    maxLength: 500,
                  }),
                  confidence: nullable({
                    type: "string",
                    enum: ["low", "medium", "high"],
                  }),
                  silent: nullable({ type: "boolean" }),
                },
              },
            },
            expires_in_seconds: nullable({
              type: "integer",
              minimum: 60,
              maximum: 86400,
            }),
          },
        },
        { type: "null" },
      ],
    },
    presentation: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "task_ids"],
          properties: {
            type: { type: "string", enum: ["task_list"] },
            task_ids: {
              type: "array",
              maxItems: 20,
              items: { type: "string", pattern: UUID_RE.source },
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "date", "items"],
          properties: {
            type: { type: "string", enum: ["schedule_plan"] },
            date: { type: "string", pattern: DATE_RE.source },
            items: {
              type: "array",
              maxItems: 20,
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "task_id",
                  "title",
                  "planned_start",
                  "planned_end",
                  "anchor",
                ],
                properties: {
                  task_id: nullable({
                    type: "string",
                    pattern: UUID_RE.source,
                  }),
                  title: nullable({
                    type: "string",
                    minLength: 1,
                    maxLength: 200,
                  }),
                  planned_start: { type: "string", pattern: TIME_RE.source },
                  planned_end: nullable({
                    type: "string",
                    pattern: TIME_RE.source,
                  }),
                  anchor: nullable({
                    type: "string",
                    enum: ["fixed", "planned"],
                  }),
                },
              },
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "items"],
          properties: {
            type: { type: "string", enum: ["task_suggestions"] },
            items: {
              type: "array",
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "reason"],
                properties: {
                  title: { type: "string", minLength: 1, maxLength: 200 },
                  reason: nullable({
                    type: "string",
                    maxLength: 200,
                  }),
                },
              },
            },
          },
        },
        { type: "null" },
      ],
    },
    consequence_updates: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "task_id",
          "severity",
          "reason",
          "confidence",
          "basis",
          "valid_until",
        ],
        properties: {
          task_id: { type: "string", pattern: UUID_RE.source },
          severity: {
            type: "string",
            enum: ["none", "low", "medium", "high", "critical"],
          },
          reason: { type: "string", minLength: 1, maxLength: 280 },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          basis: {
            type: "object",
            additionalProperties: false,
            required: ["kind"],
            properties: {
              kind: {
                type: "string",
                enum: ["explicit", "mixed", "inferred"],
              },
            },
          },
          valid_until: nullable({
            type: "string",
            pattern: DATE_RE.source,
          }),
        },
      },
    },
  },
} as const;

export const AgentPresentationSchema = z.union([
  z.object({
    type: z.literal("task_list"),
    task_ids: z.array(z.string()).max(20),
  }).strict(),
  z.object({
    type: z.literal("schedule_plan"),
    date: z.string().regex(DATE_RE),
    items: z
      .array(
        z.object({
          task_id: z.string().uuid().nullable().optional(),
          title: z
            .string()
            .trim()
            .max(200)
            .nullable()
            .optional()
            .transform((value) => value || null),
          planned_start: z.string().regex(TIME_RE),
          planned_end: z.string().regex(TIME_RE).nullable(),
          anchor: z.enum(["fixed", "planned"]).nullable().optional(),
        }).strict(),
      )
      .max(20),
  }).strict(),
  z.object({
    type: z.literal("task_suggestions"),
    items: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(200),
          reason: z.string().trim().max(200).nullable().optional(),
        }).strict(),
      )
      .max(8),
  }).strict(),
  z.null(),
]);

const ConsequenceUpdateSchema = z.object({
  task_id: z.string().uuid(),
  severity: z.enum(["none", "low", "medium", "high", "critical"]),
  reason: z.string().trim().min(1).max(280),
  confidence: z.enum(["low", "medium", "high"]),
  basis: z.object({ kind: z.enum(["explicit", "mixed", "inferred"]) }).strict(),
  valid_until: z.string().regex(DATE_RE).nullable(),
}).strict();

const AgentProposalSchema = z
  .object({
    summary: z.string().trim().min(1).max(500),
    actions: z.array(ActionSchema).min(1).max(10),
    expires_in_seconds: z.number().int().min(60).max(86400).nullable().optional(),
  })
  .strict()
  .transform(
    (proposal): AgentProposal => ({
      summary: proposal.summary,
      actions: proposal.actions.map(toAgentAction),
      expires_in_seconds: proposal.expires_in_seconds ?? null,
    }),
  );

function isActionType(value: unknown): value is ActionType {
  return (
    typeof value === "string" &&
    (ACTION_TYPES as readonly string[]).includes(value)
  );
}

export function describeParseError(error: z.ZodError) {
  const paths = error.issues.map((issue) => issue.path.join("."));
  if (paths.some((path) => path.includes("due_time"))) {
    return "השעה צריכה להיות בפורמט HH:mm, ורק יחד עם תאריך.";
  }
  if (paths.some((path) => path.includes("due_on") || path.includes("due_patch"))) {
    return "אפשר לשמור תאריך של יום, או תאריך ושעה. אי אפשר לשמור שעה בלי תאריך.";
  }
  if (paths.some((path) => path === "id" || path.endsWith(".id"))) {
    return "מזהה המשימה או הזיכרון לא היה תקין.";
  }
  if (
    paths.some((path) => path.includes("kind") || path.includes("confidence"))
  ) {
    return "שדה הזיכרון לא היה תקין.";
  }
  if (paths.some((path) => path.includes("title"))) {
    return "חסר שם תקין למשימה.";
  }
  if (paths.some((path) => path.includes("type"))) {
    return "סוג הפעולה אינו נתמך.";
  }
  return "הבקשה לביצוע לא הייתה תקינה.";
}

export function toAgentAction(data: z.infer<typeof ActionSchema>): AgentAction {
  return {
    type: data.type,
    id: data.id ?? null,
    title: data.title ?? null,
    notes: data.notes ?? null,
    due_on: data.due_on ?? null,
    due_time: data.due_time ?? null,
    due_patch: data.due_patch ?? null,
    reminder_enabled: data.reminder_enabled ?? null,
    reminder_at: data.reminder_at ?? null,
    reminder_at_patch: data.reminder_at_patch ?? null,
    reminder_offset_minutes:
      data.reminder_offset_minutes === undefined
        ? null
        : data.reminder_offset_minutes,
    reminder_patch: data.reminder_patch ?? null,
    plan_patch: data.plan_patch ?? null,
    planned_date: data.planned_date ?? null,
    planned_start_time: data.planned_start_time ?? null,
    planned_end_time: data.planned_end_time ?? null,
    kind: data.kind ?? null,
    content: data.content ?? null,
    confidence: data.confidence ?? null,
    silent: data.silent ?? null,
  };
}

export function inspectActions(raw: unknown): {
  accepted: AgentAction[];
  results: ActionResult[];
} {
  if (!Array.isArray(raw)) {
    return {
      accepted: [],
      results: [
        {
          ok: false,
          type: "invalid",
          error: "לא התקבלה רשימת פעולות תקינה.",
          detail: "actions_not_array",
        },
      ],
    };
  }

  const accepted: AgentAction[] = [];
  const results: ActionResult[] = [];
  if (raw.length > 10) {
    results.push({
      ok: false,
      type: "invalid",
      error: "יותר מדי פעולות בבת אחת.",
      detail: "too_many",
    });
  }

  for (const item of raw.slice(0, 10)) {
    const parsed = ActionSchema.safeParse(item);
    if (!parsed.success) {
      const type = isActionType((item as { type?: unknown } | null)?.type)
        ? (item as { type: ActionType }).type
        : "invalid";
      results.push({
        ok: false,
        type,
        error: describeParseError(parsed.error),
        detail: parsed.error.issues
          .map((issue) => issue.path.join(".") || "root")
          .join(","),
      });
      continue;
    }
    accepted.push(toAgentAction(parsed.data));
  }

  return { accepted, results };
}

function formatDue(due: string | null | undefined) {
  if (!due || !DATE_RE.test(due)) return "";
  const [year, month, day] = due.split("-");
  return `${day}/${month}/${year}`;
}

function successLine(result: Extract<ActionResult, { ok: true }>) {
  const due = formatDue(result.due_on);
  const time = result.due_time ? ` בשעה ${result.due_time}` : "";
  const title = result.title ? ` "${result.title}"` : "";
  switch (result.type) {
    case "task.create":
      if (result.alreadyExists) {
        return title ? `המשימה${title} כבר קיימת.` : "המשימה כבר קיימת.";
      }
      return due
        ? `שמרתי את המשימה${title} לתאריך ${due}${time}.`
        : `שמרתי את המשימה${title}.`;
    case "task.update":
      return `עדכנתי את המשימה${title}.`;
    case "task.reschedule":
      if (!due) return `הסרתי את המועד מהמשימה${title}.`;
      return `העברתי את המשימה${title} ל-${due}${time}.`;
    case "task.complete":
      return `סימנתי את המשימה${title} כבוצעה.`;
    case "task.reopen":
      return `פתחתי מחדש את המשימה${title}.`;
    case "task.delete":
      return `הסרתי את המשימה${title}.`;
    case "memory.upsert":
      if (result.silent) return "";
      return "שמרתי את זה לזיכרון האישי.";
    case "memory.remove":
      return "הסרתי את הפריט מהזיכרון האישי.";
  }
}

function failureLine(result: Extract<ActionResult, { ok: false }>) {
  return result.error;
}

const EXECUTION_CLAIM_RE =
  /שמרתי|הוספתי|עדכנתי|מחקתי|סימנתי|דחיתי|קבעתי|הסרתי|אזכיר/;

export function claimsExecution(text: string) {
  return EXECUTION_CLAIM_RE.test(text);
}

function conversationalLines(text: string) {
  return text.split("\n").map((line) =>
    line
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !claimsExecution(part))
      .join(" "),
  );
}

export function composeReply(llmReply: string, results: ActionResult[]) {
  const facts = results
    .map((result) => (result.ok ? successLine(result) : failureLine(result)))
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
  const talk = conversationalLines(llmReply)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (facts && talk) return `${facts}\n${talk}`;
  if (facts) return facts;
  if (talk) return talk;
  if (claimsExecution(llmReply)) return "לא בוצעה פעולה במערכת.";
  return llmReply.trim();
}

function normalizePresentation(
  presentation: z.infer<typeof AgentPresentationSchema>,
): AgentPresentation {
  if (!presentation) return null;
  if (presentation.type === "task_list") return presentation;
  if (presentation.type === "task_suggestions") {
    return {
      type: "task_suggestions",
      items: presentation.items.map((item) => ({
        title: item.title,
        reason: item.reason ?? null,
      })),
    };
  }
  return {
    type: "schedule_plan",
    date: presentation.date,
    items: presentation.items.map((item) => ({
      task_id: item.task_id ?? null,
      title: item.title ?? null,
      planned_start: item.planned_start,
      planned_end: item.planned_end,
      anchor: item.anchor ?? null,
    })),
  };
}

export function parseDecision(text: string) {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed) as {
      reply?: unknown;
      actions?: unknown;
      proposal?: unknown;
      presentation?: unknown;
      consequence_updates?: unknown;
    };
    if (typeof parsed.reply !== "string" || !Array.isArray(parsed.actions)) {
      return { ok: false as const };
    }
    const inspected = inspectActions(parsed.actions);
    if (inspected.results.length > 0) return { ok: false as const };
    const presentationResult = AgentPresentationSchema.safeParse(
      parsed.presentation === undefined ? null : parsed.presentation,
    );
    if (!presentationResult.success) return { ok: false as const };
    const proposalResult =
      parsed.proposal == null
        ? { success: true as const, data: null }
        : AgentProposalSchema.safeParse(parsed.proposal);
    if (!proposalResult.success) return { ok: false as const };
    if (proposalResult.data && inspected.accepted.length > 0) {
      return { ok: false as const };
    }
    const consequences = z
      .array(ConsequenceUpdateSchema)
      .max(20)
      .safeParse(
        parsed.consequence_updates === undefined
          ? []
          : parsed.consequence_updates,
      );
    if (!consequences.success) return { ok: false as const };
    return {
      ok: true as const,
      reply: parsed.reply.trim(),
      actions: inspected.accepted,
      proposal: proposalResult.data,
      presentation: normalizePresentation(presentationResult.data),
      consequence_updates: consequences.data,
    };
  } catch {
    return { ok: false as const };
  }
}
