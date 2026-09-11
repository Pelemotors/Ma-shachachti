import {
  AGENT_INSTRUCTIONS,
  AGENT_CONTRACT_VERSION,
} from "./instructions.ts";
import { renderRuntimeCapabilities } from "./capabilities.ts";
import type { ChatSurface } from "../home-surfaces.ts";
import type {
  AgentPresentation,
  ConsequenceRow,
  MemoryRow,
  TaskRow,
} from "../types.ts";
import { TIME_ZONE, dueTimeFromDueAt, jerusalemParts, todayContext } from "../time.ts";

export { AGENT_TURN_JSON_SCHEMA, parseDecision } from "../action-schema.ts";
export { TIME_ZONE, todayContext };

function formatTask(task: TaskRow, consequence?: ConsequenceRow) {
  const clock = dueTimeFromDueAt(task.due_at);
  const due = task.due_on ? ` | due ${task.due_on}` : " | due none";
  const time = clock
    ? ` | at ${clock}`
    : task.due_on
      ? " | at none"
      : "";
  const planned = task.planned_start_at
    ? ` | planned ${jerusalemParts(task.planned_start_at).date} ${jerusalemParts(task.planned_start_at).time}${
        task.planned_end_at ? `-${jerusalemParts(task.planned_end_at).time}` : ""
      }`
    : " | planned none";
  const reminder = task.due_at
    ? task.reminder_enabled
      ? ` | reminder ${task.reminder_offset_minutes ?? "default"}`
      : " | reminder off"
    : "";
  const notes = task.notes ? ` | notes ${task.notes}` : "";
  const created = ` | created_at ${task.created_at}`;
  const reschedules = ` | reschedule_count ${task.reschedule_count ?? 0}`;
  const lastRescheduled = task.last_rescheduled_at
    ? ` | last_rescheduled_at ${task.last_rescheduled_at}`
    : " | last_rescheduled_at none";
  const consequenceText = consequence
    ? ` | consequence severity=${consequence.severity} confidence=${consequence.confidence} basis=${consequence.basis.kind} valid_until=${consequence.valid_until ?? "null"} updated_at=${consequence.updated_at} reason=${consequence.reason}`
    : " | consequence none";
  return `- ${task.id} [${task.status}] ${task.title}${due}${time}${planned}${reminder}${notes}${created}${reschedules}${lastRescheduled}${consequenceText}`;
}

function surfaceInstructions(
  surface: ChatSurface | null,
  currentTime: string,
) {
  if (surface === "schedule") {
    return `
## הקשר Surface נוכחי
surface=schedule; המטרה היא לעזור למשתמש לבחון או לתכנן את הלו״ז. השעה עכשיו ${currentTime}.
הלו״ז והמשימות שסופקו הם ההקשר הטכני הקיים. הצעה אינה נשמרת ללא אישור מפורש.
`;
  }

  if (surface === "forgotten") {
    return `
## הקשר Surface נוכחי
surface=forgotten; המטרה היא לעזור למשתמש להבין מה ראוי לתשומת לב עכשיו מתוך ההקשר שסופק.
עצם פתיחת ה-Surface אינה אישור לשנות נתונים. השעה עכשיו ${currentTime}.
`;
  }

  if (surface === "free-time") {
    return `
## הקשר Surface נוכחי
surface=free-time; המטרה היא לעזור למשתמש לנצל חלון זמן פנוי. השעה עכשיו ${currentTime}.
משך ומאמץ, כאשר נמסרו, מופיעים בהודעת המשתמש. עצם פתיחת ה-Surface אינה אישור לשנות נתונים.
`;
  }

  return "";
}

export function applySurfaceTurnPolicy(input: {
  surface: ChatSurface | null;
  actions: unknown[];
  presentation: AgentPresentation;
  consequence_updates?: unknown;
}): {
  actions: unknown[];
  presentation: AgentPresentation;
  consequence_updates: unknown[];
} {
  const consequence_updates = Array.isArray(input.consequence_updates)
    ? input.consequence_updates
    : [];
  if (input.surface === "schedule") {
    return {
      actions: [],
      presentation:
        input.presentation?.type === "schedule_plan" ? input.presentation : null,
      consequence_updates,
    };
  }
  if (input.surface === "forgotten") {
    return {
      actions: [],
      presentation:
        input.presentation?.type === "task_list" ? input.presentation : null,
      consequence_updates,
    };
  }
  return {
    actions: input.actions,
    presentation: input.presentation,
    consequence_updates,
  };
}

export function surfaceInputHint(
  surface: ChatSurface | null,
  now = new Date(),
) {
  if (!surface) return "";
  const { currentTime, date, timeZone } = todayContext(now);
  if (surface === "schedule") {
    return `הקשר ל-turn הזה בלבד: surface=schedule. עכשיו ${currentTime}, ${date}, ${timeZone}. הצע לו״ז להמשך היום ב-presentation.schedule_plan בלבד. בלי לשנות משימות ובלי Markdown.\n\n`;
  }
  if (surface === "forgotten") {
    return `הקשר ל-turn הזה בלבד: surface=forgotten. עכשיו ${currentTime}, ${date}, ${timeZone}. מטרת המשטח היא להציף מה ראוי לתשומת לב; עצם פתיחתו אינה אישור ל-mutation.\n\n`;
  }
  return `הקשר ל-turn הזה בלבד: surface=free-time. עכשיו ${currentTime}. הצע מה מתאים לזמן הפנוי, בלי לשנות משימות אלא אם ביקשו במפורש.\n\n`;
}

export function buildInstructions(input: {
  tasks: TaskRow[];
  memory: MemoryRow[];
  consequences?: Map<string, ConsequenceRow>;
  surface?: ChatSurface | null;
  now?: Date;
}) {
  const { date, weekday, timeZone, currentTime, localDateTime } = todayContext(
    input.now,
  );
  const open = input.tasks.filter((task) => task.status === "open");
  const done = input.tasks.filter((task) => task.status === "done").slice(0, 8);
  const surface = input.surface ?? null;
  const consequences = input.consequences ?? new Map<string, ConsequenceRow>();

  return `${AGENT_INSTRUCTIONS}

## יכולות זמינות עכשיו — Lean V1
אתה מחליט. הקוד מבצע. אין SQL ואין גישה ישירה למסד.
החזר JSON בלבד לפי הסכימה.
שדה reply הוא שיחה בלבד: הסבר, שאלה, או גבול תחום. אל תכתוב בו שפעולה כבר נשמרה.
אם צריך לשנות נתונים — שים זאת ב-actions. הקוד יאשר למשתמש רק אחרי ביצוע אמיתי.
אם המשתמש רק מודה או מאשר בלי בקשה חדשה לשינוי נתונים — החזר actions: [] ואל תחזור על הפעולה הקודמת.

${renderRuntimeCapabilities()}

הפרטים הטכניים והגבולות של כל payload מוגדרים בסכימת הפלט. אין reminder.create או שליחת Push.
אם פעולה צריכה אישור, החזר proposal מפורש עם summary ו-actions; אל תשים את אותן פעולות גם ב-actions.
proposal אינו Persistence של הפעולות. רק approve מאוחר יותר רשאי לבצע אותן.

קיים שדה consequence_updates.
השתמש ב־consequence_updates רק כאשר למדת או הסקת מידע שימושי חדש לגבי משמעות דחיית Task קיים. אם אין שינוי שימושי, החזר מערך ריק. Consequence אינו שינוי ב־Task עצמו ואינו מוצג למשתמש.
כל Consequence Update צריך להכיל: task_id, severity, reason, confidence, basis, valid_until.
basis הוא אובייקט סגור: { "kind": "explicit" | "mixed" | "inferred" }.
valid_until יהיה null כאשר אין תוקף ברור.
אל תמציא תאריך תוקף.
אין temporary IDs. Task חדש שנוצר באותו Turn מקבל Consequence רק ב־Turn עתידי.

## הקשר עכשיו
היום: ${weekday} ${date}
השעה עכשיו: ${currentTime}
אזור זמן: ${timeZone}
זמן מקומי: ${localDateTime}
גרסת חוזה: ${AGENT_CONTRACT_VERSION}

משימות פתוחות:
${open.length ? open.map((task) => formatTask(task, consequences.get(task.id))).join("\n") : "- אין"}

הושלמו לאחרונה:
${done.length ? done.map((task) => formatTask(task)).join("\n") : "- אין"}

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
${surfaceInstructions(surface, currentTime)}`;
}
