# מה שכחתי? — Lean V1

Rebuild נקי של המוצר. הקוד הישן נשמר ב־`legacy/pre-lean-rebuild` ואינו משמש כליבה של הגרסה הזו.

## מה עובד עכשיו

- **Auth** — כניסה עם Supabase Auth; בדיקת `user_roles.approved` בצד השרת.
- **Agent / Chat** — שיחה אישית עם סוכן AI; הנחיות גלובליות ב־`lib/agent/instructions.ts`.
- **Tasks** — משימות לכל משתמש (`tasks`) עם RLS; יצירה/עדכון/השלמה דרך פעולות סגורות.
- **Planning / Schedule** — לו״ז יומי, תכנון משימות (`planned_start` / `due_at`) ושמירת תוכנית.
- **Shopping** — רשימת קניות עם RLS ו־API ייעודי.
- **Checklists** — צ׳קליסטים חוזרים עם RLS ו־API ייעודי.
- **Proposals** — הצעות סוכן לאישור/דחייה לפני ביצוע פעולות.
- **Recordings** — בנק הקלטות, תמלול, שמירה ב־Storage ושמירת 7 ימים.
- **Memory / Profile** — זיכרון העדפות (`agent_memory`) ופרופיל משתמש / onboarding.
- **Admin** — Control Room לניהול משתמשים, סטטוס ומדדי AI.

לולאה: **משתמש → הודעה → סוכן → פעולה סגורה → שמירה → תצוגה מעודכנת.**

## הרצה מקומית

ראה `.env.example` לרשימת משתני הסביבה הנדרשים.
