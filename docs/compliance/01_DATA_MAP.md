# מה שכחתי? — חבילת אבטחה, פרטיות ומיקור חוץ

תאריך: 12.09.2026  
בסיס קוד: `feature/smith-control-center @ 372a0a9e747bf4365022ef1387e21225a54aebec`  
Production baseline שנבדק לצורך dependency audit: `main @ 39e5c8b3d52b3c2d0e15612fda2f807530961c79`  
Supabase project: `mrggiqhxngoibhurinlk`  
יעד: הכנה למעבר ל-Hetzner Germany / VPS.

> מסמך עבודה טכני-ארגוני; אינו מחליף ייעוץ משפטי פרטני.

## 01 — מפת מידע (Data Map)

### תמונת מצב

האפליקציה מחזיקה מידע תפעולי אישי על חיי היום-יום של המשתמש. מאחר שחלק גדול מהמידע הוא טקסט/אודיו חופשי, יש להתייחס אליו כמידע שעשוי לכלול גם מידע רגיש לפי בחירת המשתמש.

בבדיקת Production נמצאו 25 טבלאות application בסכימת `public`, עם RLS פעיל בכולן, וכן שימוש ב-Supabase Auth וב-Supabase Storage.

| קטגוריה     | מקור עיקרי                                                  | תוכן אפשרי                              | צד שלישי              |
| ----------- | ----------------------------------------------------------- | --------------------------------------- | --------------------- |
| זהות ואימות | `auth.users`, sessions, refresh tokens                      | אימייל, password hash, session metadata | Supabase כיום         |
| הרשאות      | `user_roles`                                                | role, approved                          | לא נשלח ל-AI          |
| פרופיל      | `user_profiles`                                             | display name, style, appearance         | OpenAI לפי צורך       |
| משימות      | `tasks`, `task_consequences`                                | title, notes, dates, reminders          | OpenAI לפי צורך       |
| קניות       | `shopping_items`                                            | מוצר/כמות                               | OpenAI לפי צורך       |
| צ'קליסטים   | `checklists`, `checklist_items`                             | תוכן חופשי                              | OpenAI לפי צורך       |
| שיחות       | `chat_sessions`, `chat_messages`                            | הודעות משתמש/סוכן                       | OpenAI                |
| זיכרון סוכן | `agent_memory`                                              | facts/preferences                       | OpenAI לפי צורך       |
| פעולות סוכן | `agent_turns`, `agent_proposals`, `agent_action_executions` | החלטות/תוצאות                           | תפעולי                |
| הקלטות      | `recordings` + bucket `recordings`                          | אודיו, transcript, metadata             | OpenAI Transcriptions |
| Push        | push subscription tables                                    | endpoint/subscription                   | Web Push              |
| תזכורות     | `reminder_queue`, `notification_preferences`                | מועד/סטטוס                              | Web Push              |
| Telemetry   | `activity_events`, `ai_budgets`                             | metadata טכני                           | לא אמור להכיל תוכן    |
| Legacy      | `app_states` + receipts/proposals legacy                    | JSON/receipts                           | TBD עד retirement     |

### הקלטות קול

- bucket `recordings` הוא private.
- max 10MB.
- MIME: webm/mp4/ogg/wav.
- object path לפי `userId/recordingId.ext`.
- Storage policies מגבילות גישה לתיקיית המשתמש.
- האודיו נשלח ל-OpenAI transcription.
- transcript נשמר ב-DB.
- לאחר תמלול מוצלח נקבע raw-audio deletion ל-7 ימים.
- transcript אינו נמחק אוטומטית יחד עם האודיו.

### מידע שנשלח ל-OpenAI

ב-turn חדש ה-Agent עשוי לקבל עד 24 הודעות אחרונות, tasks, memory, profile, consequences, shopping, checklists והודעת המשתמש. Responses API משתמש ב-`store:false`.  
ב-flow הקולי, קובץ האודיו עצמו נשלח ל-OpenAI `/v1/audio/transcriptions`.

### Telemetry

ב-`activity_events` נמצאו metadata טכניים כגון latency, model, stage, requestId, status, attempts ו-counts.  
**Policy:** אין לרשום ב-Telemetry תוכן שיחה/משימה/memory/transcript, אודיו, tokens, secrets, Authorization header או push subscription מלא.

### Retention — Working Policy v1

| מידע                           | מדיניות יעד                                         |
| ------------------------------ | --------------------------------------------------- |
| Raw audio                      | עד 7 ימים לאחר תמלול מוצלח; מוקדם יותר במחיקת משתמש |
| Transcript                     | עד מחיקת התוכן/החשבון                               |
| Chat                           | עד מחיקת השיחה/החשבון                               |
| Tasks/lists/memory/profile     | עד מחיקה יזומה/חשבון                                |
| Push subscription              | עד ביטול/invalid endpoint/מחיקת חשבון               |
| reminder terminal records      | 90 יום, אלא אם הם security audit                    |
| AI/operational telemetry       | 90 יום                                              |
| Security/Admin technical audit | 24 חודשים כאשר חלה חובת השמירה                      |
| Encrypted backups              | rolling max 30 ימים                                 |
| Legacy `app_states`            | לא למחוק עד אימות Source of Truth + rollback window |

### Account deletion target

1. חסימת session/access מיד.
2. purge של נתוני live DB ו-Storage בתוך 24 שעות מהבקשה המאומתת.
3. מחיקת push/reminders/audio.
4. מחיקת chat/agent data/receipts לפי user.
5. audit מינימלי ללא תוכן.
6. backup expiry עד 30 ימים.

### Evidence

GitHub: `app/api/chat/route.ts`, `lib/agent/openai-orchestrator.ts`, `lib/audio/transcription-service.ts`, `lib/audio/recording-bank-helpers.ts`, `lib/recordings.ts`, `lib/server-auth.ts`; Live Supabase schema/RLS/Storage audit 12.09.2026.
