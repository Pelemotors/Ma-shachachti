import {
  AGENT_INSTRUCTIONS,
  AGENT_CONTRACT_VERSION,
} from "@/lib/agent/instructions";
import type { MemoryRow, TaskRow } from "@/lib/types";

export { AGENT_TURN_JSON_SCHEMA, parseDecision } from "@/lib/action-schema";

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

## יכולות זמינות עכשיו — Lean V1
אתה מחליט. הקוד מבצע. אין SQL ואין גישה ישירה למסד.
החזר JSON בלבד לפי הסכימה.
שדה reply הוא שיחה בלבד: הסבר, שאלה, או גבול תחום. אל תכתוב בו שפעולה כבר נשמרה.
אם צריך לשנות נתונים — שים זאת ב-actions. הקוד יאשר למשתמש רק אחרי ביצוע אמיתי.
אם המשתמש רק מודה או מאשר בלי בקשה חדשה לשינוי נתונים — החזר actions: [] ואל תחזור על הפעולה הקודמת.

פעולות זמינות:
- task.create: title חובה. due_on רק YYYY-MM-DD. שעה, אם חשובה, ב-notes. אין תזכורות ואין שעת התראה. אל תיצור שורה חדשה אם כבר קיימת משימה פעילה זהה בדיוק ב-title + due_on + notes. דמיון בכותרת אינו כפילות.
- task.update: id חובה, וגם title/notes/due_on לפי הצורך
- task.reschedule: id + due_on
- task.complete / task.reopen / task.delete: id חובה. delete מסמן cancelled
- memory.upsert: content חובה, kind=preference|fact, confidence=low|medium|high. id רק לעדכון קיים
- memory.remove: id חובה

אין reminder.create, אין חיפוש באינטרנט, אין שמירת שעה כשדה נפרד.
אם מבקשים תזכורת לשעה — שמור משימה לתאריך אם מתאים, וכתוב ב-reply שאין התראה לשעה.
עד 10 פעולות בפנייה. כשמזהים משימה קיימת השתמש ב-id שלה.

presentation הוא תצוגה בלבד, לא שינוי נתונים.
אם מבקשים לראות או לסכם משימות קיימות: presentation.type = "task_list" עם task_ids מההקשר, ו-reply קצר בלי רשימת Markdown.
אחרת presentation = null.

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
