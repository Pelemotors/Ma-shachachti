import {
  AGENT_INSTRUCTIONS,
  AGENT_CONTRACT_VERSION,
} from "@/lib/agent/instructions";
import type { MemoryRow, TaskRow } from "@/lib/types";

const TIME_ZONE = "Asia/Jerusalem";

export function todayContext(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("he-IL", {
    timeZone: TIME_ZONE,
    weekday: "long",
  }).format(now);
  return { date, weekday, timeZone: TIME_ZONE };
}

function formatTask(task: TaskRow) {
  const due = task.due_on ? ` | due ${task.due_on}` : "";
  const notes = task.notes ? ` | ${task.notes}` : "";
  return `- ${task.id} [${task.status}] ${task.title}${due}${notes}`;
}

export function buildInstructions(input: {
  tasks: TaskRow[];
  memory: MemoryRow[];
}) {
  const { date, weekday, timeZone } = todayContext();
  const open = input.tasks.filter((task) => task.status === "open");
  const done = input.tasks.filter((task) => task.status === "done").slice(0, 8);

  return `${AGENT_INSTRUCTIONS}

## מצב המוצר — Lean V1
אתה מחליט. הקוד מבצע. אין לך SQL ואין לך גישה ישירה למסד הנתונים.
החזר JSON בלבד לפי הסכימה. השדה reply הוא מה שהמשתמש יראה.
אל תגיד ששמרת או שינית משהו שלא ביקשת לבצע ב-actions.
אם אין צורך בפעולה, החזר actions ריק וענה בשיחה.

פעולות מותרות:
- task.create: title חובה, due_on אופציונלי (YYYY-MM-DD), notes אופציונלי
- task.update: id חובה, וגם title/notes/due_on לפי הצורך
- task.reschedule: id + due_on
- task.complete / task.reopen / task.delete: id חובה. delete מסמן cancelled ולא מוחק פיזית
- memory.upsert: content חובה, kind=preference|fact, confidence=low|medium|high. id רק אם מעדכנים זיכרון קיים
- memory.remove: id חובה

כללים קצרים:
- כשמזהים משימה קיימת, השתמשו ב-id שלה. אל תיצרו כפילות.
- due_on הוא תאריך לוח שנה בלבד, ב-${timeZone}.
- שמרו בזיכרון רק העדפה או עובדה ששווה להשתמש בה בשיחות הבאות, לא הודעה רגעית.
- עד 10 פעולות בפנייה אחת.

## הקשר עכשיו
היום: ${weekday} ${date} (${timeZone})
גרסת חוזה: ${AGENT_CONTRACT_VERSION}

משימות פתוחות:
${open.length ? open.map(formatTask).join("\n") : "- אין"}

הושלמו לאחרונה:
${done.length ? done.map(formatTask).join("\n") : "- אין"}

זיכרון אישי:
${
  input.memory.length
    ? input.memory
        .map(
          (item) =>
            `- ${item.id} [${item.kind}/${item.confidence}] ${item.content}`,
        )
        .join("\n")
    : "- אין"
}
`;
}

export const AGENT_TURN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "actions"],
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
          "kind",
          "content",
          "confidence",
        ],
        properties: {
          type: {
            type: "string",
            enum: [
              "task.create",
              "task.update",
              "task.complete",
              "task.reopen",
              "task.reschedule",
              "task.delete",
              "memory.upsert",
              "memory.remove",
            ],
          },
          id: { type: ["string", "null"] },
          title: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
          due_on: { type: ["string", "null"] },
          kind: { type: ["string", "null"] },
          content: { type: ["string", "null"] },
          confidence: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export function parseDecision(text: string) {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        reply?: unknown;
        actions?: unknown;
      };
      if (typeof parsed.reply === "string" && parsed.reply.trim()) {
        return { reply: parsed.reply.trim(), actions: parsed.actions };
      }
    } catch {
      // try next candidate
    }
  }

  return { reply: trimmed, actions: [] };
}
