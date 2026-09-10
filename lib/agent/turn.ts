import {
  AGENT_INSTRUCTIONS,
  AGENT_CONTRACT_VERSION,
} from "./instructions.ts";
import type { ChatSurface } from "../home-surfaces.ts";
import type { AgentPresentation, MemoryRow, TaskRow } from "../types.ts";
import { TIME_ZONE, dueTimeFromDueAt, todayContext } from "../time.ts";

export { AGENT_TURN_JSON_SCHEMA, parseDecision } from "../action-schema.ts";
export { TIME_ZONE, todayContext };

function formatTask(task: TaskRow) {
  const clock = dueTimeFromDueAt(task.due_at);
  const due = task.due_on ? ` | due ${task.due_on}` : " | due none";
  const time = clock
    ? ` | at ${clock}`
    : task.due_on
      ? " | at none"
      : "";
  const reminder = task.due_at
    ? task.reminder_enabled
      ? ` | reminder ${task.reminder_offset_minutes ?? "default"}`
      : " | reminder off"
    : "";
  const notes = task.notes ? ` | notes ${task.notes}` : "";
  return `- ${task.id} [${task.status}] ${task.title}${due}${time}${reminder}${notes}`;
}

function surfaceInstructions(
  surface: ChatSurface | null,
  currentTime: string,
) {
  if (surface === "schedule") {
    return `
## הוראת turn נוכחי: הצעת לו״ז להיום
surface=schedule.
השעה עכשיו ${currentTime}. זה תכנון זמני לדיון, לא שינוי נתונים.
אל תשמור, תיצור, תשנה, תדחה, תשלים או תמחק שום משימה רק משום שהיא שולבה בלו״ז.
ברירת המחדל ב-turn הזה:
actions: []
presentation: null

השתמש בשעה הנוכחית, בתאריך הנוכחי, במשימות הפתוחות, בתאריכי יעד, ב-due_at, בזיכרון הרלוונטי ובהקשר מהשיחה.
אל תקרא שעה מתוך notes. notes הוא טקסט חופשי בלבד.
משימה עם due_at היא Fixed Time Task — עוגן בשעה האמיתית. אל תזיז אותה לשעה אחרת רק כחלק מהצעת הלו״ז.
משימה עם due_on בלי due_at שייכת ליום הזה אבל אין לה שעה קשיחה. אפשר לכתוב אותה כ"במהלך היום" או לשבץ כהצעה, ולהבהיר שהשעה אינה deadline.
משימה בלי due_on ו-due_at היא backlog גמיש; אפשר להציע אותה סביב העוגנים אם מתאימה.
בנה תוכנית רק לזמן שנותר מהיום.
אל תתכנן שעות שכבר עברו. אל תציע פריט שמתחיל לפני ${currentTime} היום.
משימה שמועד היעד שלה מחר אינה אוטומטית משימה להיום.
אפשר לכלול אותה היום רק אם יש היגיון לבצע אותה מראש או אם היא דחופה, ולהסביר בקצרה למה.
אל תמציא התחייבויות, משימות או אילוצים שאינם קיימים בהקשר.
אם אין מספיק מידע, עדיין הצע גרסה ראשונית סבירה ואז שאל מה לשנות.

התשובה היא הצעה שיחתית בלבד.
אסור לכתוב ששמרת, עדכנת, הזזת או הוספת משהו רק בגלל הלחיצה על "צור לי לו״ז להיום".
זה לו״ז שעון להמשך היום, לא רשימת עדיפויות למחר.
כל פריט בשורה נפרדת: שעה ואז משימה.
בלי Markdown, בלי **bold**, בלי bullets ובלי ספרור 1. 2. 3.
התחל ממשפט שמזכיר את השעה עכשיו, למשל:
בהתחשב בזה שעכשיו ${currentTime}, הייתי מסדר את המשך הערב כך:
ואז שורות שעון.
אחרי הלו״ז אפשר לשאול בקצרה אם להזיז משהו.
רק אם בהודעה הבאה המשתמש יבקש במפורש לשנות נתונים — אז יהיו זמינים actions רגילים.
`;
  }

  if (surface === "forgotten") {
    return `
## הוראת turn נוכחי: מה שכחתי?
surface=forgotten.
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
- due_at לדחיפות של Fixed Time Task
- חשיבות ודחיפות שעולות מהמשימה ומההקשר
- דברים שהזנחה שלהם עלולה ליצור בעיה
- memory והקשר שיחה רלוונטיים
עדיין אין לבנות לו״ז ואין להציע שעות ביצוע.

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
## הוראת turn נוכחי: זמן פנוי
surface=free-time.
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

export function surfaceInputHint(
  surface: ChatSurface | null,
  now = new Date(),
) {
  if (!surface) return "";
  const { currentTime, date, timeZone } = todayContext(now);
  if (surface === "schedule") {
    return `הקשר ל-turn הזה בלבד: surface=schedule. עכשיו ${currentTime}, ${date}, ${timeZone}. הצע לו״ז שעון להמשך היום בלבד, בלי לשנות משימות ובלי Markdown.\n\n`;
  }
  if (surface === "forgotten") {
    return `הקשר ל-turn הזה בלבד: surface=forgotten. עכשיו ${currentTime}, ${date}, ${timeZone}. הצף מספר קטן של דברים חשובים עכשיו. בלי לו״ז, בלי שעות ביצוע, בלי לשנות משימות. reply קצר ו-presentation.task_list.\n\n`;
  }
  return `הקשר ל-turn הזה בלבד: surface=free-time. עכשיו ${currentTime}. הצע מה מתאים לזמן הפנוי, בלי לשנות משימות אלא אם ביקשו במפורש.\n\n`;
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
- task.create: title חובה. due_on = YYYY-MM-DD או null. due_time = HH:mm או null. due_on=null ו-due_time=null = בלי מועד. due_on בלי due_time = תאריך בלבד. due_on+due_time = Fixed Time; המערכת ממירה ל-due_at לפי Asia/Jerusalem. אסור due_time בלי due_on. אל תשמור שעה ב-notes. reminder_offset_minutes רק אם המשתמש ביקש במפורש override; אחרת null. reminder_enabled=false רק אם ביקש במפורש בלי תזכורת. אל תיצור שורה חדשה אם כבר קיימת משימה פעילה זהה בדיוק ב-title + due_on + due_at + notes.
- task.update: id חובה. due_patch=keep לא משנה מועד. due_patch=set מחיל due_on/due_time. due_patch=clear מוחק מועד. reminder_patch=keep או set באותו אופן.
- task.reschedule: id + due_on, ו-due_time אם יש שעה. due_patch=clear מסיר מועד.
- task.complete / task.reopen / task.delete: id חובה. delete מסמן cancelled
- memory.upsert: content חובה, kind=preference|fact, confidence=low|medium|high. id רק לעדכון קיים. silent=true ללמידה יזומה ברקע. silent=false רק אם המשתמש ביקש במפורש לזכור.
- memory.remove: id חובה

אין reminder.create נפרד. תזכורת שייכת למשימה. אתה לא שולח Push בעצמך.
reminder_offset_minutes=0 פירושו התראה בזמן המשימה. null = ברירת המחדל של המשתמש. אל תחליף 0 ב-default.
אל תמציא שעה למשימה שיש לה רק תאריך.
אל תבטיח "אזכיר לך" אם כתיבת המשימה נכשלה.
עד 10 פעולות בפנייה. כשמזהים משימה קיימת השתמש ב-id שלה.

presentation הוא תצוגה בלבד, לא שינוי נתונים.
אם מבקשים לראות או לסכם משימות קיימות: presentation.type = "task_list" עם task_ids מההקשר, ו-reply קצר בלי רשימת Markdown.
אחרת presentation = null.

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
${surfaceInstructions(surface, currentTime)}`;
}
