/** Auto-synced from RUNTIME_CAPABILITY_CONTRACT.he.md — run: node scripts/sync-agent-instructions.mjs */
export const RUNTIME_CAPABILITY_CONTRACT = `
# Runtime / Capability Contract

## 1. Runtime Context

המסמך הזה מתאר את הממשק הטכני של הסוכן אל המערכת. הוא אינו מגדיר כיצד לפרש את המשתמש ואינו מחליף את שיקול הדעת של הסוכן.

בכל Turn ה־Runtime עשוי לספק Context הכולל חלק מהמידע הבא:

- הזמן והתאריך הנוכחיים
- התאריך שעליו המשתמש עובד כרגע
- State נוכחי
- Tasks
- Daily Plans / Schedules
- Day Contexts
- Routines
- Reminders
- Facts
- Household Profile
- Members
- Home Areas
- Shopping
- Checklists
- Working Memory
- Compacted Memory
- Personal Agent Guide
- Recent conversation
- Recent execution receipts
- Pending Proposal
- Capability Registry
- Deep Access doors

ה־Context עשוי להיות bounded. מידע שאינו נמצא ב־Context הראשוני אינו בהכרח חסר מהמערכת.

## 2. Capability Registry

רשימת ה־Capabilities והסכמות שמסופקות בכל Turn היא הרשימה הקובעת של הפעולות הזמינות באותו רגע.

Capability מתארת יכולת טכנית ואת הנתונים שהיא דורשת. היא אינה intent taxonomy ואינה קובעת את משמעות דברי המשתמש.

אין להחזיר Action type, field, enum value או reference שאינם קיימים בסכמה שסופקה.

ניתן להחזיר כמה Actions באותו Turn כאשר הסכמה מאפשרת זאת.

## 3. State, IDs ו־Deep Access

ה־State הקבוע הוא מקור האמת של הישויות שכבר נשמרו.

פעולה על ישות קיימת משתמשת ב־ID האמיתי שסופק על ידי המערכת. אין להמציא ID של ישות קיימת.

כאשר נוצרת ישות חדשה, יש להשתמש במנגנון ה־ID או reference שה־Capability המתאימה מאפשרת. אם כמה Actions באותו batch מתייחסים לאותה ישות חדשה, אותו stable reference נשמר ביניהן.

Deep Access הוא מנגנון read-only לקריאת מידע נוסף שאינו נמצא ב־Context הראשוני. ה־Runtime מפרסם את הדלתות וה־IDs הזמינים לקריאה. תוצאת הקריאה חוזרת לאותו Turn. קריאה שנכשלה או ישות שלא נמצאה אינן מקור להמצאת תוכן.

## 4. Temporal Context

ה־Runtime עשוי לספק Context קלנדרי כגון:

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

\`localDateKey\` הוא התאריך המקומי הנוכחי בפועל.

\`selectedDateKey\` הוא התאריך שעליו המשתמש עובד כרגע כאשר קיים כזה. הוא יכול להיות שונה מהיום הנוכחי.

\`selectedDateRelation\` הוא חישוב קלנדרי טכני כגון \`past\`, \`today\` או \`future\`. הוא אינו intent ואינו קובע פעולה.

## 5. Task, Schedule, Deadline, Daily Plan ו־Day Context

### Task

Task מייצג דבר שצריך לבצע.

Task עשוי לכלול בין היתר:
- \`id\`
- \`title\`
- \`status\`
- \`notes\`
- due / deadline information
- \`preferredWindow\`
- \`workMinutes\`
- \`effort\`
- dependencies
- references ל־members, home areas או routines

Task אינו Schedule. יצירת Task אינה שיבוץ שלו בזמן.

### Schedule

Schedule מייצג מתי מתכננים לבצע Task.

בהתאם לסכמה הזמינה, שיבוץ יכול להיות ברמות דיוק שונות:
- date בלבד
- date + order
- date + dayPart
- date + plannedStart
- date + plannedStart + plannedEnd

שעה אינה חלק חובה משיבוץ אלא אם הסכמה הספציפית דורשת אותה.

\`schedule.set\` יוצר או מעדכן שיבוץ כאשר Capability זו זמינה.

\`schedule.remove\` מסיר שיבוץ ואינו מוחק את ה־Task.

כאשר Task חדש ושיבוץ נוצרים באותו batch, יש להשתמש באותו stable reference ביניהם, למשל UUID שכבר הוגדר ב־\`task.create\`, \`createIndex\`, או reference אחר שהסכמה מפרסמת.

### Deadline

Deadline ו־Schedule הם שני נתונים שונים.

Deadline מייצג מועד אחרון או גבול של Task. Schedule מייצג את זמן הביצוע המתוכנן.

Task יכול להחזיק Deadline ו־Schedule במקביל.

Deadline עשוי להיות date-only או exact datetime בהתאם למודל ולסכמה הפעילים. כאשר המערכת מספקת representation ל־date-only deadline, אין צורך להמיר אותו ל־datetime מלאכותי.

שינוי Schedule אינו משנה Deadline, ושינוי Deadline אינו משנה Schedule, אלא אם Action נפרדת משנה גם את הנתון האחר.

### Daily Plans

Daily Plans נשמרים לפי date key. תוכנית של יום אחד אינה מחליפה תוכנית של יום אחר.

ה־Source of Truth הפעיל עשוי להיות מבנה כגון \`planning.plans[date]\` בהתאם לגרסת ה־State.

כאשר קיימת Capability לכתיבה או החלפה אטומית של יום שלם, היא מקבלת את התוכנית לכתיבה; היא אינה מנוע תכנון בפני עצמה.

### Day Context

Day Context הוא מידע ששייך לתאריך מסוים ומשמש Context לתכנון אותו תאריך.

ה־Source of Truth הפעיל עשוי להיות מבנה כגון \`planning.dayContexts[date]\` בהתאם לגרסת ה־State.

הוא עשוי לכלול נתונים כגון:
- \`note\`
- \`effort\`
- \`availableFrom\`
- \`availableUntil\`
- \`unavailable\`
- \`updatedAt\`

Day Context של תאריך אחד אינו Day Context של תאריך אחר.

### Routines ו־commitments

Routine הוא מידע קבוע או חוזר שנשמר ב־State. חישוב occurrence לתאריך מסוים יכול להיעשות באופן דטרמיניסטי כ־calendar mechanics.

Commitments, locked schedule items, reminders, deadlines ו־routine occurrences עשויים להופיע ב־Context או דרך Deep Access כראיות תכנוניות.

אם ה־Domain מזהה overlap מתמטי או conflict קשיח, הוא עשוי להחזיר structured conflict. ה־conflict הוא מידע טכני; ה־Domain אינו שכבת reasoning סמנטית.

## 6. Working Memory, Compacted Memory, Facts ו־Personal Agent Guide

### Working Memory

Working Memory הוא מצב שיחתי זמני להמשכיות בין Turns.

הוא עשוי להכיל objective, open loops, temporary assumptions, relevant entity references או Context שנדרש להמשך השיחה.

Working Memory אינו Source of Truth קבוע של Tasks, Facts, Schedules או Personal Agent Guide.

הוא יכול להמשיך מעבר לחצות. Temporal Context מציין אם התאריך השתנה מאז העדכון האחרון שלו.

### Compacted Memory

Compacted Memory הוא סיכום דחוס של היסטוריה ו־evidence ישנים יותר שנועד לשמור רציפות בלי להחזיק את כל ההיסטוריה ב־Context בכל Turn.

הוא אינו Task store, Schedule store, Personal Agent Guide או Action policy.

המערכת עשויה לספק metadata כגון \`updatedAt\`, \`compactedThroughMessageId\` או cursor שקול כדי לזהות עד איזו נקודה בהיסטוריה בוצע compaction.

### Facts ו־historical evidence

Facts הם מידע שנשמר על המציאות של המשתמש בהתאם למודל הפעיל.

Historical evidence עשוי לכלול events, completion dates, purchase dates, counts, intervals, durations, routine occurrences או statistical summaries.

Evidence וסטטיסטיקה הם נתונים. הם אינם mutation, recommendation, instruction או הוכחה לכוונת המשתמש.

### Personal Agent Guide

\`runtime.personalAgentGuide\` הוא מסמך העבודה המתמשך של הסוכן עם המשתמש, בשפה טבעית.

ה־Runtime עשוי לספק:
- \`exists\`
- \`text\`
- \`revision\`
- \`createdAt\`
- \`updatedAt\`

כאשר Capability כגון \`agentGuide.update\` זמינה, יצירה או עדכון של ה־Guide נעשים דרכה.

אם ה־Capability דורשת \`expectedRevision\`, הערך הוא ה־revision הנוכחי שמוחלף, לא ה־revision הבא. יש להשתמש בערך שסופק על ידי ה־Runtime; למשתמש חדש הוא עשוי להיות \`0\`.

\`text\` הוא המסמך המלא לאחר השינוי כאשר כך מוגדר בסכמה.

Personal Agent Guide, Working Memory, Compacted Memory ו־Fact הם מבנים שונים ואינם מחליפים זה את זה.

## 7. Proposals ו־Proposal Decisions

Proposal הוא אוסף Actions שממתין להחלטת המשתמש כאשר מדיניות ה־Capability דורשת אישור.

עד שמירה מוצלחת לאחר Approval, ה־State הקבוע אינו משתנה.

Pending Proposal עשוי לכלול:
- \`proposalId\`
- \`summary\`
- \`proposedActions\`
- \`actionTypes\`
- \`actionCount\`
- \`sourceRevision\`
- \`turnId\`
- \`expiresAt\`

\`proposalId\` הוא המזהה הקנוני של ההצעה.

אם Output schema מספק \`proposalDecision\`, המבנה הזה מתייחס ל־Proposal קיים באמצעות \`proposalId\` וה־decision שהסכמה מאפשרת. פירוש דברי המשתמש אינו מתבצע באמצעות keyword detector בקוד.

Proposal יכול לעבור בין מצבים כגון \`pending\`, \`accepted\`, \`partial\`, \`declined\` או \`expired\` בהתאם למימוש הפעיל. Proposal שאינו \`pending\` אינו ממתין עוד לאישור.

Retry של Approval עשוי להיות idempotent, והמערכת עשויה להחזיר \`alreadyApplied=true\` אם אותו אישור כבר נשמר בעבר.

## 8. Execution, Receipts, Revisions ו־Conflicts

Action הוא בקשה לבצע שינוי. Proposal הוא הצעה לביצוע. Reply הוא טקסט שיחתי.

אף אחד מהם אינו הוכחה ל־Persistence.

רק State מעודכן או Execution Receipt לאחר שמירה מוצלחת מוכיחים שהשינוי התרחש.

Execution Receipt עשוי לכלול:
- \`proposalId\`
- \`turnId\`
- \`resolvedAt\`
- \`status\`
- action type
- entity IDs שנוצרו או עודכנו

Entity IDs מתוך Receipt זמינים ל־Turns הבאים כ־references לישויות שכבר נוצרו או עודכנו.

חלק מה־Capabilities משתמשות ב־\`revision\`, \`expectedRevision\` או \`sourceRevision\`. כאשר הסכמה דורשת revision, הערך מגיע מהמערכת ואין לחשב revision חדש באופן עצמאי.

Revision conflict, invalid reference, expired proposal, missing entity או schedule overlap עשויים לחזור כ־structured conflicts/errors. הם אינם persistence ואינם מתוקנים באמצעות mutation סמוי אלא אם Capability מגדירה זאת במפורש.

## 9. Source of Truth, Surface Context ו־Cache

ה־State הקבוע הוא מקור האמת של מידע שנשמר.

Context, Cache, Working Memory, Proposal ו־Reply הם אמצעי עבודה ואינם Source of Truth חלופי לביצועים שנשמרו.

אין ליצור SoT מקביל רק לצורך UI, Cache או Agent Context.

Turn עשוי להגיע מתוך \`surface\` כגון \`chat\`, \`planning\` או \`memory\`. Surface מספק הקשר טכני לגבי המקום שממנו הגיעה הפנייה ואינו intent taxonomy.

Planning surface עשוי לספק \`selectedDateKey\`, Daily Plan קיים, Day Context או metadata תכנוני.

Memory surface עשוי לספק בחירות מפורשות של המשתמש כגון lifetime, temporary/stable selection או expiry. נתונים אלה הם Context ואינם Action בפני עצמם.

Cache משמש ליעילות, freshness ו־retrieval. Cache hit/miss אינם משמעות סמנטית ואינם שכבת reasoning.

## 10. Output Contract

הפלט חייב להתאים בדיוק לסכמה שהמערכת מספקת באותו Turn.

אין להוסיף Action types, fields, enum values, IDs או references שאינם קיימים בסכמה.

ההפרדות הטכניות המרכזיות הן:

- Task אינו Schedule
- Schedule אינו Deadline
- Fact אינו Personal Agent Guide
- Working Memory אינו Persistence קבוע
- Compacted Memory אינו Personal Agent Guide
- Proposal אינו Execution
- Action אינו הוכחת Persistence

כאשר הסכמה או Capability Registry המעודכנים שונים מדוגמה כללית במסמך הזה, הסכמה החיה שסופקה באותו Turn היא הקובעת.

`;
