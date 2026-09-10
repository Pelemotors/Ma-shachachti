# מה שכחתי? — Lean V1

זהו rebuild נקי של המוצר. הקוד הישן נשמר ב־`legacy/pre-lean-rebuild` ואינו משמש כליבה של הגרסה הזו.

## מה עובד בשלב 1

- כניסה עם Supabase Auth והמשתמשים הקיימים.
- בדיקת `user_roles.approved` בצד השרת.
- שיחה אישית עם סוכן AI.
- היסטוריית שיחה נפרדת לכל משתמש ב־`chat_messages` עם RLS.
- קובץ ההנחיות הגלובלי של הסוכן נשמר ללא שינוי: `lib/agent/INSTRUCTIONS.he.md`.
- השפה העיצובית והנכסים העונתיים נשמרו, אך שאר מסכי המוצר אינם חלק מהליבה עדיין.

## מה בכוונה לא קיים עדיין

Tasks, Memory, Planning, Shopping, Routines, First Scan, Proposals, Forecasting, Deep Access, AppState, revision engine וכל שכבות ה־orchestration הישנות.

נוסיף יכולת אחת בכל פעם רק אחרי שהלולאה הקיימת עובדת מקצה לקצה.
