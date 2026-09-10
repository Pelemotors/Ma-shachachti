import { z } from "zod";
import {
  ACTION_TYPES,
  type ActionResult,
  type ActionType,
  type AgentAction,
  type AgentPresentation,
} from "./types.ts";

import { DATE_RE, TIME_RE } from "./time.ts";

export { DATE_RE, TIME_RE };

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  due_on: z.string().regex(DATE_RE).nullable().optional(),
  due_time: z.string().regex(TIME_RE).nullable().optional(),
  due_patch: z.enum(["keep", "set", "clear"]).nullable().optional(),
  reminder_enabled: z.boolean().nullable().optional(),
  reminder_offset_minutes: z
    .number()
    .int()
    .min(0)
    .max(10080)
    .nullable()
    .optional(),
  reminder_patch: z.enum(["keep", "set"]).nullable().optional(),
  kind: z.enum(["preference", "fact"]).nullable().optional(),
  content: z.string().trim().min(1).max(500).nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]).nullable().optional(),
});

function nullable(schema: Record<string, unknown>) {
  return { anyOf: [schema, { type: "null" }] };
}

export const AGENT_TURN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "actions", "presentation"],
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
          "reminder_offset_minutes",
          "reminder_patch",
          "kind",
          "content",
          "confidence",
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
          reminder_offset_minutes: nullable({
            type: "integer",
            minimum: 0,
            maximum: 10080,
          }),
          reminder_patch: nullable({
            type: "string",
            enum: ["keep", "set"],
          }),
          kind: nullable({ type: "string", enum: ["preference", "fact"] }),
          content: nullable({ type: "string", minLength: 1, maxLength: 500 }),
          confidence: nullable({
            type: "string",
            enum: ["low", "medium", "high"],
          }),
        },
      },
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
        { type: "null" },
      ],
    },
  },
} as const;

export const AgentPresentationSchema = z.union([
  z.object({
    type: z.literal("task_list"),
    task_ids: z.array(z.string()).max(20),
  }),
  z.null(),
]);

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
    reminder_offset_minutes:
      data.reminder_offset_minutes === undefined
        ? null
        : data.reminder_offset_minutes,
    reminder_patch: data.reminder_patch ?? null,
    kind: data.kind ?? null,
    content: data.content ?? null,
    confidence: data.confidence ?? null,
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

function claimsExecution(text: string) {
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

export function parseDecision(text: string) {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed) as {
      reply?: unknown;
      actions?: unknown;
      presentation?: unknown;
    };
    if (typeof parsed.reply !== "string" || !Array.isArray(parsed.actions)) {
      return { ok: false as const };
    }
    const presentationResult = AgentPresentationSchema.safeParse(
      parsed.presentation === undefined ? null : parsed.presentation,
    );
    return {
      ok: true as const,
      reply: parsed.reply.trim(),
      actions: parsed.actions,
      presentation: (presentationResult.success
        ? presentationResult.data
        : null) as AgentPresentation,
    };
  } catch {
    return { ok: false as const };
  }
}
