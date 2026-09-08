# AI Chat Reliability — P0 Release Blocker

מסמך עבודה מחייב ל־Ma-shachachti.
עקרונות תמציתיים לסוכן נמצאים גם ב־`.cursor/rules/ai-chat-reliability.mdc` (`alwaysApply`).

## הקשר

אחרי Deploy הצ׳אט חייב להמשיך לעבוד. תקלה חוזרת של „AI לא עונה” מטופלת כ־**P0 לפני כל פיצ׳ר אחר**.

### מה כנראה לא הבעיה

- Service Worker בלי runtime caching — `/api/chat` לא אמור להיתקע ב־PWA cache.
- `/api/chat` מחזיר `Cache-Control: no-store`.
- `turnId` אופציונלי; השרת נופל ל־`idempotencyKey` (תאימות לאחור סבירה).

### חורים ממשיים בקוד (לא השערות)

**סטטוס (עודכן אחרי ייצוב Chat → Plan → Home):**

1. ~~Agent טוען `INSTRUCTIONS.he.md` ב־`readFile()`~~ — **תוקן:** הוראות ב־bundle (`lib/agent/instructions.ts`).
2. `/api/health` — **שופר:** `deploymentVersion`, `appSchemaVersion`, `databaseReady` (ENV/RPC path), `aiConfigured`. עדיין: health ירוק ≠ צ׳אט חי; AI readiness ב־`/api/health/ai`.
3. ~~הלקוח זורק תשובת AI על revision mismatch~~ — **תוקן בשרת:** re-read + revalidate; reply נשמר; receipt `failed` מאפשר reclaim.
4. ~~Turn מפוצל לכמה שמירות~~ — **תוקן בענן:** server-owned turn + claim/complete receipts.

**חוב טכני מתועד (לא חוסם את שרשרת Plan):** `client_upgrade_required` מלא, time-budget מתקדם, Manual QA ל־Push/OS.

---

## R01 — אבחון מדויק לפני שינוי

לכל `/api/chat` לרשום:

`requestId`, `turnId`, `deploymentVersion`, `stage`, `errorCode`, `latencyMs`, `model`, `stateRevision`

Stages:

```text
authorize → read_state → budget → load_agent → openai_request
→ openai_response → parse → validate_actions → persist_turn → complete
```

כל Failure עם stage, למשל:

```text
ai.failure stage=load_agent code=agent_instructions_unavailable deployment=abc123
```

---

## R02 — להסיר תלות filesystem מה־Agent

**אסור:**

```ts
await readFile(process.cwd() + "/lib/agent/INSTRUCTIONS.he.md")
```

**חובה:** הוראות כחלק מה־bundle, למשל `lib/agent/instructions.ts`:

```ts
import { AGENT_INSTRUCTIONS } from "./instructions";
```

בדיקה: production build + Chat מה־build עצמו.

---

## R03 — Health אמיתי ל־AI

### `/api/health`

- Application alive
- env configuration
- DB reachable
- schema compatibility

### `/api/internal/ai-health` (מוגן)

בקשה אמיתית ל־OpenAI עם input סינתטי (בלי מידע משתמש):

- API key valid
- model exists
- Responses API works
- schema accepted
- response parses
- AgentDecision validation passes

לא מספיק `Boolean(process.env.OPENAI_API_KEY)`.

---

## R04 — Deployment Version אמיתי

להפסיק `"version": "0.1.0"` קבוע.

להחזיר למשל:

```ts
{ buildVersion, gitCommitSha, schemaVersion, agentContractVersion }
```

מטרה: לדעת איזו Frontend דיברה עם איזו Backend.

---

## R05 — Versioned Chat Contract

```ts
CHAT_API_VERSION = 2
AGENT_CONTRACT_VERSION = 2
```

Client שולח `apiVersion`, `clientVersion`, `message`, `turnId`.

שדות חדשים אופציונליים כשאפשר (PWA ישן).  
אי־תאימות קשיחה → `client_upgrade_required` (לא Error כללי).

---

## R06 — זיהוי Client ישן

על `client_upgrade_required`:

1. לשמור draft + pending turn  
2. UI: „עלתה גרסה חדשה… מעדכן”  
3. Reload מבוקר  

לא להשאיר Send על Client לא תואם.

---

## R07 — Revision Conflict של הצ׳אט

**אסור:** לזרוק את כל תשובת ה־AI רק כי revision השתנה.

**חובה:**

```text
AI finished → read latest state → revalidate actions
→ apply still-valid actions
→ always show AI reply (with note if actions skipped)
```

---

## R08 — Turn כיחידה אחת אמינה

```text
User message + Agent decision + Assistant response + Auto actions
= one logical operation (server-owned)
```

Flow רצוי:

```text
POST /api/chat
→ authorize → resolve turnId → read state → call AI
→ validate decision → re-read state if needed → validate actions
→ commit assistant message + safe actions → seal turn → return
```

הלקוח אינו האחראי הראשי לביצוע Turn עסקי.

---

## R09 — Idempotency של Turn שלם

על בסיס `chat_receipts` / `idempotencyKey` / `turnId`:

Retry אחרי ניתוק רשת:

- לא יוצר Task חדש  
- לא שולח הודעת משתמש שוב  
- לא מפעיל Action פעמיים  
- מחזיר את אותה תוצאה  

---

## R10 — AI Output failure recovery

Structured Output נשאר.

על `ai_invalid_output`: ניסיון תיקון/fallback **אחד** בלבד.  
אין loop אינסופי.

---

## R11 — Model fallback אמיתי

`OPENAI_MODEL` → `OPENAI_FALLBACK_MODEL` על:

- timeout / 5xx / invalid output

**לא** על:

- insufficient_quota  
- invalid API key  
- global configuration error  

---

## R12 — Time budget

דוגמה:

```text
Primary ≤ 20s
Fallback = remaining
Persistence reserve 5–10s
```

אסור שה־serverless ייגמר בדיוק בזמן שמירת התשובה.

---

## R13 — DB compatibility gate

```text
EXPAND → deploy compatible DB addition → deploy code → verify → CONTRACT later
```

לא למחוק שדה ואז לפרוס app חדש בזמן ש־PWA ישן פתוח.

---

## R14 — DB Schema Version

`database_schema_version` מפורשת + `MIN_REQUIRED_DB_VERSION`.  
Health נכשל אם migration חסרה — **לפני** שהמשתמש מגיע לצ׳אט.

---

## R15 — Post-deploy AI Smoke

### Test 1 — Provider

State סינתטי: „ענה שאין פעולה לביצוע” → AgentDecision תקין.

### Test 2 — Application

Chat אמיתי עם test account/fixture ניטרלי:

`HTTP 200`, reply תקין, `turnId` תקין, אין כפילות.

---

## R16 — Deploy אינו PASS בלי Chat

```text
lint → typecheck → unit/integration → build → E2E
→ deploy preview → AI smoke → DB compatibility
→ production → production AI smoke
```

AI smoke נכשל ⇒ הגרסה אינה תקינה (גם אם Vercel READY).

---

## R17 — Preview לפני Production

```text
Vercel Preview → AI smoke → application smoke → production
```

---

## R18 — Production Canary

מיד אחרי Production:

`/api/health` + AI provider smoke + authenticated chat smoke  
רק אז Release תקין.

---

## R19 — Client error handling

לשמור `code`, `requestId`, `status`, `deploymentVersion` (לא רק `data.error` כמחרוזת).

---

## R20 — המשתמש לא מאבד טיוטה

בכל Failure: draft שמור, turnId שמור, Retry זמין, אין Duplicate.

UI: „לא הצלחתי לקבל תשובה כרגע. ההודעה שלך נשמרה.” + „נסה שוב”.

---

## R21 — Error UX לפי סוג

| סוג | מסר |
|-----|-----|
| timeout | לקח יותר מדי זמן — לנסות שוב |
| provider | שירות ה־AI לא זמין כרגע |
| client old | עלתה גרסה חדשה — מעדכן |
| DB/version | המערכת מתעדכנת — נסי בעוד רגע |
| action conflict | להציג reply ולהסביר שהשינוי לא נשמר |

---

## R22 — Observability

דרך activity קיימת:

`chat_attempts`, `chat_success`, `chat_failure`, success rate, p50/p95 latency,  
failure_by_code/deployment, fallback_rate, invalid_output_rate.

מדד מרכזי: **Chat Success Rate**.

---

## R23 — Logging בלי מידע פרטי

**לא:** תוכן הודעות, facts, household state.  
**כן:** turnId, requestId, deployment, code, stage, model, latency, revision, action count.

---

## R24 — בדיקות כשל יזומות

OpenAI: key חסר/שגוי, model שגוי, quota, 429, 500, timeout, malformed, invalid schema.  
DB: unavailable, migration missing, revision mid-call.  
Client: old client, retry, refresh mid-turn, disconnect אחרי Send, double tap.

---

## R25 — תרחיש Deployment חי

PWA פתוח → deploy חדש → Chat נוסף חייב לעבוד או controlled upgrade (draft restored).  
לא „AI הפסיק לענות”.

---

## R26 — תרחיש Migration Deploy

Client ישן + migration + backend חדש → backward-compatible או controlled upgrade. לא 500.

---

## R27 — הוראות Agent כחלק מ־Build

Test: `AGENT_INSTRUCTIONS.length > …` וה־bundle כולל אותן.

---

## R28 — Agent Contract Test (CI, בלי OpenAI)

Schema נבנה; valid decision עובר; invalid נכשל; parser isolation עובד.

---

## R29 — Smoke scripts

- `scripts/ai-smoke.ts` — Provider/Agent  
- `scripts/prod-chat-smoke.ts` — Chat application flow  

---

## R30 — חוק Release

אין לסמן Deploy כהושלם על:

```text
Vercel READY + build PASS + /api/health 200
```

Release תקין רק אם:

```text
PRODUCTION CHAT SMOKE = PASS
```

---

## סדר ביצוע מומלץ

| Phase | פריטים |
|-------|--------|
| 1 — נקודת שבר | R01–R04 |
| 2 — Turn עמיד | R07–R12 |
| 3 — Deploy safety | R05–R06, R13–R18 |
| 4 — UX/אבחון | R19–R23 |
| 5 — Failure tests | R24–R29 |
| 6 — Release policy | R30 |

**התחלה מומלצת בקוד:** שמירה על Instructions ב־bundle + revision revalidate בשרת + Plan sync אחרי approve (לא regex NLP).

---

## תנאי קבלה מרכזי

לפני סגירת התקלה:

1. Deploy ראשון/שני/שלישי — Chat לפני ואחרי; PWA פתוח ממשיך.  
2. Retry לא מכפיל.  
3. Migration לא שוברת Chat.  
4. Timeout מציג Retry.  
5. Revision conflict לא מעלים reply.  
6. Health מזהה OpenAI שבור.  
7. Release Gate תופס לפני משתמש.

Semantic-first נשאר בתוקף: אין „תיקון” באמצעות מילוני regex.

---

# P0 — בדיקות מיידיות ליציבות AI Chat

מטרה: **להוכיח שהצ׳אט עמיד לפני/אחרי שינויי קוד ו־Deploy**, בלי להעמיד פנים שנבדקו דברים שדורשים מכשיר פיזי.

## מה לא לבדוק עכשיו (Manual Acceptance נפרד)

אל תסמן כחלק מבדיקות אוטומטיות:

- Push פיזי ב־iPhone PWA / Android Chrome
- הרשאות מערכת אמיתיות במכשיר
- Notification Center של iOS/Android

מותר לבדוק קוד Push/Service Worker **סטטית** — אסור לטעון שבוצעה בדיקת Push פיזית.

Live OpenAI: אם אין credentials → `NOT RUN` (לא FAIL, לא PASS מזויף). הקוד וה־smoke חייבים להיות מוכנים.

---

## T01 — Chat API contract

Request תקין עם `message` + `idempotencyKey` + `turnId`:

- מתקבל; `turnId` נשמר; `requestId` מוחזר; לא cached.

בלי `turnId` (Client ישן): `turnId = idempotencyKey`. אין 400 רק בגלל Client ישן.

---

## T02 — Idempotency

אותו `idempotencyKey` + message פעמיים → אותה תשובה; אין Agent call כפול; אין Message/Task כפולים; replay metadata תקין.

אותו key עם הודעה אחרת → `409` / `chat_idempotency_conflict`.

---

## T03 — Agent instructions availability

אחרי מעבר ל־bundle: `AGENT_INSTRUCTIONS.length > 0` + markers מרכזיים מה־prompt.  
Production build לא יכול לעלות בלי Instructions.

---

## T04 — AgentDecision Schema

- valid decision עובר
- malformed JSON → `ai_invalid_json`
- invalid decision → `ai_invalid_output`
- Action פגום אחד → שאר Actions נשמרים
- clarification + safe actions → safe לא נמחקים

---

## T05 — OpenAI provider mocked failures

| Mock | Expected code |
|------|----------------|
| 401/403 | `ai_configuration` |
| 429 quota | `ai_insufficient_quota` |
| 429 רגיל | `ai_rate_limited` |
| 500/502 | `ai_upstream` |
| timeout | `ai_timeout` |
| network | `ai_network` |
| completed בלי text | `ai_empty` |
| status ≠ completed | `ai_incomplete` |

---

## T06 — Fallback model

Primary timeout/500/invalid → fallback success; `selectedModel` = fallback.  
אין fallback על invalid API key / insufficient quota.

---

## T07 — Revision conflict (קריטי)

Chat על revision 10; state → 11 בזמן Agent; Reply + Action חוזרים:

- Reply **לא נעלם**
- Actions עוברים revalidation מול 11
- תקין מתבצע; לא תקין נדחה
- אסור לזרוק Turn רק בגלל `basedOnRevision !== currentRevision`

---

## T08 — Turn partial failure

- AI הצליח, save נכשל → לא נטען שבוצע; draft/turn ל־Retry; אין duplicate
- user message נשמר, AI נכשל → ההודעה לא הולכת לאיבוד; Retry באותו Turn
- response לשרת, client נפל → Retry מחזיר Receipt; לא מפעיל שוב

---

## T09 — Double submit

שני `sendMessage()` במקביל → Agent/Message אחת; lock/idempotency חוסמים.

---

## T10 — Refresh/retry (`CHAT_PENDING_KEY`)

שלח → user נשמר → AI נכשל → refresh/controller חדש → Retry → אותו idempotency key; אין User message שנייה.

---

## T11 — Health endpoint

`/api/health` מדווח: build/git version, schema version, agent contract version, configuration readiness.  
לא `version: "0.1.0"` קבוע. Missing env → 503 `configuration_missing`.

---

## T12 — AI readiness

Endpoint/script נפרד. עם `OPENAI_API_KEY`: call סינתטי קצר, בלי מידע משתמש, בלי Actions — schema + parse ל־AgentDecision.  
בלי credentials: `LIVE AI CHECK: NOT RUN — credentials unavailable` (Mock/Contract עדיין PASS).

---

## T13 — Production build local

```bash
npm run build && npm run start
```

על ה־build: health, chat (mock/setup), Instructions ב־bundle, אין תלות ב־`readFile` לקובץ שלא נארז.

---

## T14 — Service Worker static

`public/sw.js` בלי runtime caching; `/api/*` לא נכנס ל־Cache. בלי מכשיר פיזי.

---

## T15 — Client/server version mismatch

Client ישן עם שדות אופציונליים חסרים → עובד אם אפשר.  
אי־תאימות אמיתית → `client_upgrade_required` (לא 500); Draft נשמר לפני Reload.

---

## T16 — DB compatibility

State V1/ישן → `readState()` תקין אחרי migration.  
Mismatch ידוע → Health/readiness מפורש; לא Internal Error על `/api/chat`.

---

## T17 — Error payload אחיד

```ts
{ error: string; code: string; requestId: string; /* + version metadata אם יש */ }
```

Client שומר `code` + `requestId`, לא רק `throw new Error(data.error)`.

---

## T18 — UI failure behavior

- timeout → draft + Retry
- configuration → הודעה מובנת
- revision conflict → Reply לא נעלם
- upgrade required → Draft לפני Reload
- אין Silent Failure אחרי Send

---

## T19 — Chat smoke scripts

- `scripts/ai-smoke.ts` — Provider + schema (כשיש credentials)
- `scripts/chat-smoke.ts` — Application flow (אם יש test user בטוח)

אם אין credentials/user: לבנות את הסקריפט ולדווח שלא הורץ — **לא להמציא PASS**.

---

## T20 — Deploy regression simulation

חוזי Client ישן+נוכחי מול Chat API חדש; State ישן מול Backend חדש. מדמה Deploy בלי PWA פיזי.

---

## T21 — Logs / observability

בכשל נרשמים: requestId, turnId, stage, errorCode, deploymentVersion, latency, model, revision — בלי תוכן אישי.

---

## T22 — CI gate

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm run e2e
```

E2E שדורש auth/credentials/מכשיר → `skipped` עם סיבה. לדווח `X passed / Y skipped`.

---

## תנאי PASS — טבלת סיום חובה

| תחום | תוצאה |
|------|--------|
| Chat contract | PASS/FAIL |
| Backward compatibility | PASS/FAIL |
| Turn idempotency | PASS/FAIL |
| Retry after failure | PASS/FAIL |
| Revision conflict | PASS/FAIL |
| Agent schema/parser | PASS/FAIL |
| OpenAI mocked failures | PASS/FAIL |
| Model fallback | PASS/FAIL |
| Production build chat | PASS/FAIL |
| Health/versioning | PASS/FAIL |
| DB/state compatibility | PASS/FAIL |
| Service Worker no API cache | PASS/FAIL |
| UI error/retry | PASS/FAIL |
| Live OpenAI smoke | PASS / NOT RUN |
| Playwright | X pass / Y skipped |

בנוסף לדוח:

1. מספר tests לפני/אחרי  
2. Bugs שנמצאו  
3. Bugs שתוקנו  
4. בדיקות שלא בוצעו ולמה  
5. **לא לערבב אוטומציה שעברה עם Manual QA שעוד לא בוצע**

המיקוד: **Chat עמיד לגרסאות, Retry, State changes וכשלי OpenAI/DB — בלי Push פיזי בסבב הזה.**
