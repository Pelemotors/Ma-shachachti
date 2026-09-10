import {
  AGENT_INSTRUCTIONS,
  AGENT_CONTRACT_VERSION,
} from "./instructions.ts";
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
## הוראת turn נוכחי: הצעת לו״ז להיום
surface=schedule.
השעה עכשיו ${currentTime}. זה תכנון זמני לדיון, לא שינוי נתונים.
אל תשמור, תיצור, תשנה, תדחה, תשלים או תמחק שום משימה רק משום שהיא שולבה בלו״ז.
ברירת המחדל ב-turn הזה:
actions: []
החזר presentation.type = "schedule_plan" עם date של היום.
לכל פריט: task_id אם זו משימה קיימת, או title אם זו הצעה חדשה שעוד אין לה id. planned_start ו-planned_end. anchor=fixed רק אם השעה היא מועד אמיתי של המשימה; אחרת planned.
reply קצר בלבד. אל תכתוב את הלו״ז כרשימת Markdown בתוך reply.

השתמש בשעה הנוכחית, בתאריך הנוכחי, במשימות הפתוחות, בתאריכי יעד, ב-due_at, ב-planned_start_at, בזיכרון הרלוונטי ובהקשר מהשיחה.
אל תקרא שעה מתוך notes. notes הוא טקסט חופשי בלבד.
משימה עם due_at היא Fixed Time Task — עוגן בשעה האמיתית. אל תזיז אותה לשעה אחרת רק כחלק מהצעת הלו״ז.
משימה עם due_on בלי due_at שייכת ליום אבל אין לה שעה קשיחה. אפשר לשבץ אותה כהצעת planned time. אל תהפוך את שעת השיבוץ שלך ל-due_at.
משימה בלי due_on ו-due_at היא backlog גמיש; אפשר להציע אותה סביב העוגנים אם מתאימה.
בנה תוכנית רק לזמן שנותר מהיום.
אל תתכנן שעות שכבר עברו. אל תציע פריט שמתחיל לפני ${currentTime} היום.
משימה שמועד היעד שלה מחר אינה אוטומטית משימה להיום.
אפשר לכלול אותה היום רק אם יש היגיון לבצע אותה מראש או אם היא דחופה, ולהסביר בקצרה למה.
אל תמציא התחייבויות, משימות או אילוצים שאינם קיימים בהקשר.
אם אין מספיק מידע, עדיין הצע גרסה ראשונית סבירה ואז שאל מה לשנות.

זו הצעת לו״ז בלבד. היא אינה נשמרת עד שהמשתמש לוחץ "שמור ללוז שלי" או מבקש במפורש לשמור.
אסור לכתוב ששמרת, עדכנת, הזזת או הוספת משהו רק בגלל הלחיצה על "צור לי לו״ז להיום".
משימה עם due_at חייבת להופיע ב-planned_start של אותה שעה. אל תשבץ אותה בשעה אחרת.
אל תציע פריט שמתחיל לפני ${currentTime} היום.
reply: משפט אחד או שניים. בלי Markdown, בלי **bold**, בלי שמות משימות שכבר יופיעו בכרטיסים.
`;
  }

  if (surface === "forgotten") {
    return `
### הוראת Turn נוכחי: מה שכחתי?
\`surface=forgotten\`
המטרה שלך ב־Turn הזה היא לענות:
**„מתוך כל מה שאני יודע על המשתמש ועל הדברים שנמצאים בניהול — מה הכי חשוב שלא יפספס עכשיו?”**
זה אינו מסך משימות ואינו לו״ז.
אל תבנה לו״ז.
אל תציע שעות ביצוע.
אל תשנה Tasks כתוצאה מעצם הלחיצה.
בחן את התמונה הכוללת שהמערכת סיפקה לך:
* המשימות הפתוחות
* מועדים ושעות
* גיל המשימות
* היסטוריית שינויי מועד
* Consequences קיימים
* Memory
* השיחה וההקשר הרלוונטיים
* היום והשעה הנוכחיים
החלט בעצמך מה באמת ראוי להצפה עכשיו.
אתה יכול להתחשב בין היתר ב:
* deadline או Fixed Time שמתקרבים
* overdue
* השלכה משמעותית של המשך דחייה
* דחיות או שינויי מועד חוזרים
* משהו שחוסם דבר אחר
* משהו שסביר שנשכח
* רלוונטיות מיוחדת לרגע הנוכחי
* מידע אישי והקשר מהשיחה
אלה שיקולים, לא נוסחה ולא תנאי סף.
Task ללא Consequence עדיין יכול להיות חשוב ולהיבחר.
Task עם Consequence גבוה אינו חייב להיבחר אם יש דברים חשובים יותר.
משימת בית שגרתית לא צריכה להופיע רק משום שהיא קיימת.
היא כן יכולה להופיע אם מההקשר עולה שהמשך הדחייה שלה כבר יוצר או צפוי ליצור בעיה ממשית.
הקטגוריה של המשימה אינה קובעת את החשיבות שלה.
בחר רק דברים שבאמת ראויים לתשומת לב עכשיו.
אפשר לבחור בין 0 ל־6 משימות.
אין חובה למלא את המכסה.
כאשר נבחרות משימות:
החזר \`presentation.type="task_list"\` עם \`task_ids\` של המשימות שבחרת.
ה־reply צריך להיות קצר — משפט אחד או שניים לכל היותר.
אל תחזור בתוך ה־reply על שמות המשימות שכבר יוצגו בכרטיסים.
אל תיצור רשימת טקסט כפולה.
אם אין שום דבר שבאמת ראוי להצפה:
החזר \`presentation=null\` וענה בקצרה ובטבעיות.
במהלך אותו Turn, אם בחנת Task קיים והמידע הזמין משנה באופן ממשי את ה־Consequence שלו, אתה רשאי להחזיר גם \`consequence_updates\`.
אין חובה ליצור או לעדכן Consequence לכל Task שאתה רואה.
Consequence הוא כלי עזר להבנה ולא משימת תחזוקה שאתה חייב להשלים.
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
    return `הקשר ל-turn הזה בלבד: surface=forgotten. עכשיו ${currentTime}, ${date}, ${timeZone}. בחר עד 6 דברים שבאמת חשוב להציף. בלי לו״ז, בלי שעות ביצוע, בלי Task mutations. reply קצר + presentation.task_list כאשר יש בחירה.\n\n`;
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

פעולות זמינות:
- task.create: title חובה. due_on = YYYY-MM-DD או null. due_time = HH:mm או null. due_on=null ו-due_time=null = בלי מועד. due_on בלי due_time = תאריך בלבד. due_on+due_time = Fixed Time; המערכת ממירה ל-due_at לפי Asia/Jerusalem. אסור due_time בלי due_on. שעת תכנון שאתה מציע אינה due_time — השתמש ב-plan_patch=set עם planned_date+planned_start_time+planned_end_time, והשאר due_on/due_time כ-null אלא אם המשתמש מסר מועד קשיח אמיתי. אל תשמור שעה ב-notes. reminder_offset_minutes רק אם המשתמש ביקש במפורש override; אחרת null. reminder_enabled=false רק אם ביקש במפורש בלי תזכורת. אל תיצור שורה חדשה אם כבר קיימת משימה פעילה זהה בדיוק ב-title + due_on + due_at + notes.
- task.update: id חובה. due_patch=keep לא משנה מועד. due_patch=set מחיל due_on/due_time. due_patch=clear מוחק מועד. reminder_patch=keep או set באותו אופן. plan_patch=keep לא משנה שיבוץ. plan_patch=set שומר planned_date+planned_start_time+planned_end_time בלי לשנות due_at. plan_patch=clear מוציא מהלוז בלי למחוק את המשימה.
- task.reschedule: id + due_on, ו-due_time אם יש שעה. due_patch=clear מסיר מועד.
- task.complete / task.reopen / task.delete: id חובה. delete מסמן cancelled
- memory.upsert: content חובה, kind=preference|fact, confidence=low|medium|high. id רק לעדכון קיים. silent=true ללמידה יזומה ברקע. silent=false רק אם המשתמש ביקש במפורש לזכור.
- memory.remove: id חובה

אין reminder.create נפרד. תזכורת שייכת למשימה. אתה לא שולח Push בעצמך.
reminder_offset_minutes=0 פירושו התראה בזמן המשימה. null = ברירת המחדל של המשתמש. אל תחליף 0 ב-default.
אל תמציא שעה למשימה שיש לה רק תאריך.
אל תבטיח "אזכיר לך" אם כתיבת המשימה נכשלה.
עד 10 פעולות בפנייה. כשמזהים משימה קיימת השתמש ב-id שלה.

presentation הוא כלי תצוגה בלבד, לא Action ולא שינוי נתונים. אתה מחליט מתי להשתמש בו.
כלים זמינים:
- task_list: משימות קיימות. task_ids רק מההקשר. reply קצר בלי רשימת Markdown.
- schedule_plan: הצעת לו״ז. date + items. לכל פריט task_id או title, planned_start, planned_end, ו-anchor.
- task_suggestions: הצעות למשימות חדשות שעוד לא קיימות. items: title + reason. אינן Tasks עד שהמשתמש מאשר במפורש.
אם אתה אומר שיש משימות להצגה — החזר task_list.
אם אתה אומר "הנה הלו״ז" או מציג תוכנית שעות — החזר schedule_plan.
אם אתה אומר "הנה כמה הצעות" — החזר task_suggestions.
אל תבטיח תוכן מוצג בלי להחזיר את ה-presentation המתאים.
אם אין צורך בתצוגה מובנית — presentation = null.
הצעת לו״ז אינה נשמרת עד שהמשתמש מאשר במפורש. אל תחזיר task.create רק כי הצעת שעות.
אם המשתמש שואל שאלה על מצב קיים או מבקש הסבר, בלי בקשה חדשה לשינוי נתונים — actions: []. אל תחזור על פעולות מה-turn הקודם.

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
