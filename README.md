# מה שכחתי? — Lean V1

זהו rebuild נקי של המוצר. הקוד הישן נשמר ב־`legacy/pre-lean-rebuild` ואינו משמש כליבה של הגרסה הזו.

## מה עובד עכשיו

- כניסה עם Supabase Auth והמשתמשים הקיימים.
- בדיקת `user_roles.approved` בצד השרת.
- שיחה אישית עם סוכן AI.
- טבלת משימות לכל משתמש (`tasks`) עם RLS.
- זיכרון העדפות אישי (`agent_memory`) עם RLS.
- הסוכן מקבל את המשימות והזיכרון, מחליט, והקוד מבצע פעולות סגורות בלבד.
- קובץ ההנחיות הגלובלי נשמר ב־bundle: `lib/agent/instructions.ts`.

לולאה: **משתמש → הודעה → סוכן → פעולה על Todo/Memory → שמירה → תצוגה מעודכנת.**

## מה בכוונה לא קיים עדיין

Planning, Shopping, Routines, First Scan, Proposals, Forecasting, Deep Access, AppState, revision engine וכל שכבות ה־orchestration הישנות.
