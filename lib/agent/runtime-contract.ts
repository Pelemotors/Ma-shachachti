/** Auto-synced from RUNTIME_CAPABILITY_CONTRACT.he.md — run: node scripts/sync-agent-instructions.mjs */
export const RUNTIME_CAPABILITY_CONTRACT = `
# Runtime / Capability Contract

## 1. Runtime Context

המסמך הזה מתאר את הממשק הטכני של הסוכן אל המערכת. הוא אינו מגדיר כיצד לפרש את המשתמש ואינו מחליף את שיקול הדעת של הסוכן.

בכל Turn ה־Runtime עשוי לספק Context מצומצם הכולל חלק מהמידע הבא:

- State נוכחי
- זמן ותאריך
- התאריך שעליו המשתמש עובד כרגע
- Tasks
- Daily Plans / Schedules
- Day Context
- Routines ו־routine projection לתאריך הנבחר
- Reminders
- Facts
- Household Profile / Members / Home Areas
- Shopping / Checklists
- Working Memory
- Compacted Memory
- Personal Agent Guide
- Recent conversation
- Recent execution receipts
- Pending Proposal
- Capability Registry
- Deep Access doors

Context הוא bounded. מידע שאינו מופיע בו אינו בהכרח חסר מהמערכת. Deep Access מאפשר קריאה read-only של מידע נוסף דרך הדלתות וה־IDs שה־Runtime מפרסם.

### Temporal Context

ה־Runtime מספק אובייקט \`temporalContext\` שעשוי לכלול:

- \`nowUtc\`
- \`nowLocal\`
- \`timezone\`
- \`localDateKey\`
- \`localDayOfWeek\`
- \`selectedDateKey\`
- \`selectedDateDayOfWeek\`
- \`selectedDateRelation\`
- \`workingMemoryUpdatedAt\`
- \`workingMemoryDateKey\`
- \`dayChangedSinceWorkingMemoryUpdate\`

\`localDateKey\` הוא היום המקומי הנוכחי. \`selectedDateKey\` הוא התאריך שעליו המשתמש עובד כרגע, אם סופק, והוא יכול להיות שונה מהיום הנוכחי. \`selectedDateRelation\` הוא חישוב קלנדרי טכני כגון \`past\`, \`today\` או \`future\` ואינו intent.

## 2. Capability Registry

רשימת ה־Capabilities והסכמות שמסופקות בכל Turn היא הרשימה הקובעת של הפעולות הזמינות באותו רגע.

Capability מתארת יכולת טכנית ואת הנתונים שהיא דורשת. היא אינה intent taxonomy ואינה קובעת את משמעות דברי המשתמש.

אין להחזיר Action type, field, enum value או reference שאינם קיימים בסכמה שסופקה.

ניתן להחזיר כמה Actions באותו Turn כאשר הסכמה מאפשרת זאת.

Capabilities רלוונטיות לתכנון כוללות, כאשר הן מופיעות ב־Registry:

- \`schedule.set\` — יוצר או מעדכן שיבוץ. ה־payload החי עשוי לכלול \`taskId\` או \`createIndex\`, \`date\`, וכן \`order?\`, \`locked?\`, \`dayPart?\`, \`plannedStart?\`, \`plannedEnd?\`.
- \`schedule.remove\` — מסיר שיבוץ ואינו מוחק את ה־Task.
- \`schedule.replaceDay\` — כותב יום שלם אטומית מתוך \`{ date, items[] }\`. ה־Capability כותבת את הפריטים שסופקו; היא אינה בוחרת אילו Tasks צריכים להיכנס ליום.
- \`planning.set\` — כותב Day Context עבור תאריך לתוך \`planning.dayContexts[date]\`.
- \`planning.clear\` — מנקה Day Context; הסכמה החיה עשויה לכלול \`date?\`.
- \`task.create\` / \`task.update\` — יכולים לכלול deadline בהתאם לסכמה החיה.

## 3. State, IDs ו־Deep Access

ה־State הקבוע הוא מקור האמת של הישויות שכבר נשמרו.

פעולה על ישות קיימת משתמשת ב־ID האמיתי שסופק על ידי המערכת. אין להמציא ID של ישות קיימת.

כאשר נוצרת ישות חדשה, יש להשתמש במנגנון ה־ID או reference שה־Capability המתאימה מאפשרת. אם כמה Actions באותו batch מתייחסים לאותה ישות חדשה, אותו stable reference נשמר ביניהן.

Deep Access הוא read-only. ה־Runtime מפרסם את הדלתות וה־IDs הזמינים לקריאה, ותוצאת הקריאה חוזרת לאותו Turn. קריאה שנכשלה או ישות שלא נמצאה אינן מקור להמצאת תוכן.

## 4. Task, Schedule, Deadline, Daily Plan ו־Day Context

### Task

Task מייצג דבר שצריך לבצע. הוא עשוי לכלול בין היתר \`id\`, \`title\`, \`status\`, \`notes\`, deadline, \`preferredWindow\`, \`workMinutes\`, \`effort\`, dependencies ו־references לישויות אחרות.

Task אינו Schedule. יצירת Task אינה שיבוץ שלו בזמן.

### Schedule

Schedule מייצג מתי מתכננים לבצע Task.

שיבוץ יכול להיות ברמות דיוק שונות:

- date בלבד
- date + \`order\`
- date + \`dayPart\`
- date + \`plannedStart\`
- date + \`plannedStart\` + \`plannedEnd\`

שעה אינה חובה אלא אם הסכמה הספציפית דורשת אותה.

Task חדש ושיבוץ שלו יכולים להופיע באותו batch באמצעות אותו stable reference, למשל UUID שהוגדר ב־\`task.create\` או \`createIndex\` כאשר הסכמה מאפשרת זאת.

### Deadline

הייצוג החי של deadline הוא:

\`Task.deadline = { date, time: "HH:mm" | null, timezone, precision: "date" | "datetime" } | null\`

\`dueAt\` נשאר representation של datetime מדויק כאשר הוא קיים, או \`null\`.

Date-only deadline אינו דורש מילוי \`dueAt\` בשעה מלאכותית.

Task יכול להחזיק Deadline וגם Schedule במקביל. שינוי של אחד מהם אינו משנה את השני אלא אם Action נפרדת עושה זאת.

### Daily Plans

Source of Truth חי לתוכניות הוא:

\`planning.plans[date]\`

תוכנית של יום אחד אינה מחליפה תוכנית של יום אחר.

\`schedule.replaceDay\` מאפשר כתיבה אטומית של \`items[]\` לתאריך נתון כאשר Capability זו זמינה.

### Day Context

Source of Truth חי ל־Day Context הוא:

\`planning.dayContexts[date]\`

\`planning.today\` הוא מבנה legacy לקריאה לאחור בלבד ואינו Source of Truth פעיל לאחר normalization.

Day Context עשוי לכלול \`note\`, \`effort\`, \`availableFrom\`, \`availableUntil\`, \`unavailable\`, \`updatedAt\` ושדות נוספים בהתאם לסכמה החיה.

ה־Context עשוי לספק ישירות:

- \`dayContext\` — ה־Day Context של \`selectedDate\`
- \`routinesOnSelectedDate\` או \`routineProjection\` — occurrences דטרמיניסטיים לתאריך הנבחר, ללא דירוג סמנטי
- \`overlapEvidence\` או \`planning.overlapEvidence\` — evidence מתמטי על overlaps בזמנים מדויקים

Structured overlap/conflict הוא evidence טכני. ה־Domain אינו שכבת reasoning סמנטית.

## 5. Working Memory, Compacted Memory, Facts ו־Personal Agent Guide

### Working Memory

Working Memory הוא מצב שיחתי זמני להמשכיות בין Turns. הוא עשוי לכלול \`objective\`, \`contextSummary\`, \`openLoops\`, \`lastAgentQuestion\`, \`relevantEntityIds\`, \`assumptions\` ו־\`updatedAt\` בהתאם לסכמה החיה.

Working Memory אינו Source of Truth קבוע של Tasks, Facts, Schedules או Personal Agent Guide. הוא יכול להמשיך מעבר לחצות; \`temporalContext\` מציין אם היום השתנה מאז העדכון האחרון שלו.

### Compacted Memory

Compacted Memory הוא סיכום דחוס של היסטוריה ו־evidence ישנים יותר. הוא אינו Task store, Schedule store, Personal Agent Guide או Action policy.

ה־State החי עשוי לכלול:

- \`facts\`
- \`preferences\`
- \`patterns\`
- \`updatedAt\`
- \`compactedThroughMessageId\`
- \`compactedThroughCreatedAt\`

כאשר Output schema כולל \`compactedMemoryUpdate\`, זהו שדה output ייעודי לייצוג הדחוס החדש:

\`{ facts, preferences, patterns }\`

\`memory.compact\` הוא מנגנון פנימי של המערכת ואינו Capability חיצונית ב־Agent Capability Registry.

### Facts ו־historical evidence

Facts הם מידע שנשמר על המציאות של המשתמש בהתאם למודל הפעיל.

Historical evidence עשוי לכלול events, completion dates, purchase dates, counts, intervals, durations, routine occurrences או statistical summaries.

Evidence וסטטיסטיקה הם נתונים; הם אינם mutation, recommendation, instruction או הוכחה לכוונת המשתמש.

### Personal Agent Guide

\`runtime.personalAgentGuide\` הוא מסמך העבודה המתמשך של הסוכן עם המשתמש, בשפה טבעית.

הממשק החי כולל:

- \`exists\`
- \`text\`
- \`revision\`
- \`createdAt\`
- \`updatedAt\`

יצירה או עדכון נעשים דרך \`agentGuide.update\` כאשר Capability זו זמינה. אם נדרש \`expectedRevision\`, משתמשים ב־revision הנוכחי שסיפק ה־Runtime; למשתמש חדש הוא עשוי להיות \`0\`. \`text\` הוא המסמך המלא לאחר השינוי כאשר כך מוגדר בסכמה.

Personal Agent Guide, Working Memory, Compacted Memory ו־Fact הם מבנים שונים ואינם מחליפים זה את זה.

## 6. Surface Context

Surface מציין מאיפה הגיעה הפנייה ומהו ההקשר הטכני שלה. הוא אינו intent taxonomy ואינו מגביל את ה־Capabilities שניתן לבחור.

### Planning

Planning Turn עשוי לספק:

- \`selectedDate\`
- \`scheduleIntent: "build" | "realign" | "changed-day"\`
- Daily Plan קיים
- \`dayContext\`
- \`routinesOnSelectedDate\` / \`routineProjection\`
- \`overlapEvidence\`

\`scheduleIntent\` מתאר את פעולת ה־UI שהפעילה את ה־Turn. הוא אינו תחליף להבנת דברי המשתמש.

### Memory

Memory Turn עשוי לספק:

\`memoryContext: { requestedLifetime?: "stable" | "temporary", expiresAt?: string | null }\`

וכן:

\`needsCompaction?: boolean\`

אלה נתוני Context טכניים. הם אינם Action בפני עצמם ואינם מסווגים אוטומטית את הקלט כ־Fact.

## 7. Proposals ו־Proposal Decisions

Proposal הוא אוסף Actions שממתין להחלטת המשתמש כאשר מדיניות ה־Capability דורשת אישור. עד שה־Proposal מאושר ונשמר, ה־State הקבוע אינו משתנה.

Pending Proposal עשוי לכלול \`proposalId\`, \`summary\`, \`actionTypes\`, \`actionCount\`, \`sourceRevision\`, \`turnId\` ו־\`expiresAt\`.

כאשר Output schema כולל \`proposalDecision\`, הצורה החיה היא:

\`{ proposalId, decision: "approve" | "reject" | "revise" }\`

\`proposalId\` מתייחס ל־Proposal הקיים. המערכת מאמתת בעלות, status, revision, expiration ו־applicability.

Proposal lifecycle עשוי לכלול \`pending\`, \`accepted\`, \`partial\`, \`declined\` ו־\`expired\`. Proposal שאינו \`pending\` אינו ממתין עוד לאישור. Retry של Approval עשוי להיות idempotent.

## 8. Execution, Receipts, Revisions ו־Conflicts

Action הוא בקשה לבצע שינוי. Proposal אינו Execution. Reply אינו Persistence.

רק State מעודכן או Execution Receipt לאחר שמירה מוצלחת מוכיחים שהשינוי התרחש.

ה־Runtime עשוי לספק \`recentExecutionReceipts\` בצורה החיה:

\`[{ proposalId, turnId, resolvedAt, actions: [{ type, entityId }] }]\`

ל־receipt עצמו אין שדה \`status\` במבנה החי הזה.

Receipts הם evidence עובדתי על ישויות ופעולות שבוצעו, ו־entity IDs מתוכם זמינים ל־Turns הבאים.

Capabilities מסוימות משתמשות ב־\`revision\`, \`expectedRevision\` או source revision. כאשר schema דורשת revision, משתמשים בערך שסיפקה המערכת. Revision conflict אומר שהמצב הישן אינו תקף לביצוע הנוכחי.

ה־Domain עשוי להחזיר structured conflict עבור overlap, invalid reference, stale revision, expired proposal או missing entity. Conflict כזה הוא מידע טכני ולא mutation אוטומטי.

## 9. Source of Truth ו־Cache

ה־State הקבוע הוא מקור האמת של מידע שנשמר.

מבנים כגון Context, Cache, Working Memory, Reply ו־Proposal אינם הופכים פעולה ל־Persistence בפני עצמם.

אין ליצור Source of Truth מקביל רק לצורך UI או Agent Context.

Cache משמש ליעילות, freshness ו־retrieval. Cache אינו reasoning layer, ו־cache hit או miss אינם משמעות סמנטית.

## 10. Output Contract

הפלט חייב להתאים בדיוק לסכמה שהמערכת מספקת באותו Turn.

בנוסף לשדות הקיימים בסכמה, שני שדות output טכניים עשויים להיות זמינים:

- \`proposalDecision?: { proposalId, decision: "approve" | "reject" | "revise" } | null\`
- \`compactedMemoryUpdate?: { facts, preferences, patterns } | null\`

\`compactedMemoryUpdate\` אינו Action חיצוני; הוא output ייעודי ל־memory compaction.

אין להוסיף Action types, fields, IDs או enum values שאינם קיימים בסכמה החיה.

הפרדות טכניות מרכזיות:

- Task אינו Schedule
- Schedule אינו Deadline
- Fact אינו Personal Agent Guide
- Working Memory אינו Persistence קבוע
- Compacted Memory אינו Personal Agent Guide
- Proposal אינו Execution
- Action אינו הוכחת Persistence
`;
