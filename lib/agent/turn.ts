import {
  AGENT_INSTRUCTIONS,
  AGENT_CONTRACT_VERSION,
} from "./instructions.ts";
import type { ChatSurface } from "../home-surfaces.ts";
import type { AgentPresentation, MemoryRow, TaskRow } from "../types.ts";

export { AGENT_TURN_JSON_SCHEMA, parseDecision } from "../action-schema.ts";

export const TIME_ZONE = "Asia/Jerusalem";

function partValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function padClock(value: string) {
  return value.padStart(2, "0");
}

export function todayContext(now = new Date()) {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const clockParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = new Intl.DateTimeFormat("he-IL", {
    timeZone: TIME_ZONE,
    weekday: "long",
  }).format(now);

  const date = `${partValue(dateParts, "year")}-${partValue(dateParts, "month")}-${partValue(dateParts, "day")}`;
  const currentTime = `${padClock(partValue(clockParts, "hour"))}:${padClock(partValue(clockParts, "minute"))}`;

  return {
    date,
    weekday,
    timeZone: TIME_ZONE,
    currentTime,
    localDateTime: `${date}T${currentTime}`,
  };
}

function formatTask(task: TaskRow) {
  const due = task.due_on ? ` | due ${task.due_on}` : "";
  const notes = task.notes ? ` | ${task.notes}` : "";
  return `- ${task.id} [${task.status}] ${task.title}${due}${notes}`;
}

function surfaceInstructions(
  surface: ChatSurface | null,
  currentTime: string,
) {
  if (surface === "schedule") {
    return `
## משטח: הצעת לו״ז להיום
אתה מתבקש כעת לבנות הצעת לו״ז להיום.
זהו תכנון זמני לדיון עם המשתמש.
אל תשמור, תיצור, תשנה, תדחה, תשלים או תמחק שום משימה רק משום שהיא שולבה בלו״ז.
ברירת המחדל ב-turn הזה:
actions: []
presentation: null

השתמש:
- בשעה הנוכחית
- בתאריך הנוכחי
- במשימות הפתוחות
- בתאריכי יעד
- ב-notes
- בזיכרון האישי הרלוונטי
- ובהקשר מהשיחה

בנה תוכנית שמתאימה לזמן שנותר מהיום.
השעה עכשיו ${currentTime}. אל תתכנן שעות שכבר עברו. אל תציע פריט שמתחיל לפני ${currentTime} היום.
משימה שמועד היעד שלה מחר אינה אוטומטית "משימה להיום".
אפשר לכלול אותה היום רק אם יש היגיון לבצע אותה מראש או אם היא דחופה, ולהסביר בקצרה למה.
אל תמציא התחייבויות, משימות או אילוצים שאינם קיימים בהקשר.
אם אין מספיק מידע כדי לבנות לו״ז מדויק, עדיין הצע גרסה ראשונית סבירה ואז אפשר לשאול את המשתמש מה לשנות.

התשובה היא הצעה שיחתית בלבד.
אסור לכתוב ששמרת, עדכנת, הזזת או הוספת משהו רק בגלל הלחיצה על "צור לי לו״ז להיום".
כתוב לו״ז טקסטואלי נקי: כל פריט בשורה נפרדת, שעה ואז משימה.
בלי Markdown, בלי **bold**, בלי bullets וספרור מיותר.
אחרי הלו״ז אפשר לשאול בקצרה אם להזיז משהו.
רק אם בהודעה הבאה המשתמש יבקש במפורש לשנות נתונים — אז יהיו זמינים actions רגילים.
`;
  }

  if (surface === "forgotten") {
    return `
## משטח: מה שכחתי?
המטרה היא להציף למשתמש מספר קטן של דברים שחשוב שיראה עכשיו.
אין לבנות לו״ז.
אין להציע שעות ביצוע.
אין לשנות Tasks.
ברירת המחדל ב-turn הזה:
actions: []

בחר מתוך המשימות הקיימות את הדברים שהכי ראוי להציף עכשיו, בהתחשב ב:
- תאריך נוכחי ושעה נוכחית
- overdue
- due בקרוב
- חשיבות ודחיפות שעולות מהמשימה ומההקשר
- דברים שהזנחה שלהם עלולה ליצור בעיה
- memory והקשר שיחה רלוונטיים

משימות בית יומיומיות רגילות אינן צריכות להופיע סתם כי הן קיימות.
הן כן יכולות לעלות אם הדחייה שלהן כבר יוצרת נזק, לחץ או בעיה ממשית.
הצג מספר קטן וממוקד, בדרך כלל 1–4 משימות, לא dump של כל הרשימה.

כאשר נבחרות משימות:
השתמש ב-presentation.type = "task_list" עם task_ids בלבד.
ה-reply שמעל ה-presentation צריך להיות משפט אחד או שניים לכל היותר.
אל תכתוב בתוך reply מחדש את שמות כל המשימות, מספרי 1,2,3, תאריכים שכבר מוצגים בכרטיס, bullets, Markdown, **bold**, או פירוט ארוך של הרשימה.
אסור מצב שבו אותה משימה מופיעה גם כרשימת טקסט וגם ככרטיס מתחת.

אם אין משהו שבאמת ראוי להציף:
אמור זאת בפשטות, presentation = null, ואל תבחר משימות בכוח.
`;
  }

  if (surface === "free-time") {
    return `
## משטח: זמן פנוי
המשתמש סימן שיש לו זמן פנוי עכשיו.
הצע מתוך המשימות הקיימות מה מתאים לזמן שיש לו, לפי השעה וההקשר.
אין לבנות לו״ז מלא של היום ואין לשנות Tasks אלא אם ביקש במפורש.
`;
  }

  return "";
}

export function applySurfaceTurnPolicy(input: {
  surface: ChatSurface | null;
  actions: unknown[];
  presentation: AgentPresentation;
}): { actions: unknown[]; presentation: AgentPresentation } {
  if (input.surface === "schedule") {
    return { actions: [], presentation: null };
  }
  if (input.surface === "forgotten") {
    return { actions: [], presentation: input.presentation };
  }
  return {
    actions: input.actions,
    presentation: input.presentation,
  };
}

export function buildInstructions(input: {
  tasks: TaskRow[];
  memory: MemoryRow[];
  surface?: ChatSurface | null;
  now?: Date;
}) {
  const { date, weekday, timeZone, currentTime, localDateTime } = todayContext(
    input.now,
  );
  const open = input.tasks.filter((task) => task.status === "open");
  const done = input.tasks.filter((task) => task.status === "done").slice(0, 8);
  const surface = input.surface ?? null;

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
${surfaceInstructions(surface, currentTime)}
## הקשר עכשיו
היום: ${weekday} ${date}
השעה עכשיו: ${currentTime}
אזור זמן: ${timeZone}
זמן מקומי: ${localDateTime}
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
