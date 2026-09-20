# Google Play Data Safety audit — מה שכחתי?

**Policy version:** `2026-09-20`  
**App:** מה שכחתי? · https://mashachachti.co.il  
**Operator:** Pelemotors · Contact: `noreply@mashachachti.co.il`  
**Policy / deletion URLs:** `/privacy`, `/account-deletion`

**Important:** Answers below are for data the **backend + declared client capabilities** collect. Do **not** invent undeclared collection. Mark store-binary-specific rows with the correct package.

**Shipped Play package:** `com.mashachachti.app` (Expo native). Capacitor `il.co.mashachachti.app` is legacy WebView, not the Play binary.

---

## Global Data Safety answers

| Play question | Recommended answer (facts) | Notes |
|---|---|---|
| Does the app collect or share user data? | **Yes — collects**; shares with processors to operate the service | Not “sold” |
| Is data encrypted in transit? | **Yes** (HTTPS) | — |
| Can users request deletion? | **Yes** — in-app / https://mashachachti.co.il/account-deletion | Authenticated `DELETE` confirm |
| Independent security review | `UNVERIFIED` / typically **No** unless completed | Do not claim without evidence |
| Committed to Play Families / designed for children | **No** — app not directed at children | No specific age gate (`REQUIRES_DECISION` if required) |

**Sharing vs third parties:** declare **sharing** with service providers (OpenAI, Resend, push infra) as needed to run the app — not for advertising sale. Do not claim “never shared with anyone.”

**Advertising ID / analytics SDK:** no third-party analytics SDK. First-party `logMobileEvent` only.

---

## Data types matrix (Play categories)

Legend:
- **Collected** = yes if product stores or transmits that category for app functionality
- **Shared** = yes if sent to a processor outside the operator-controlled Supabase host for processing
- **Ephemeral** = processed only in memory / short-lived and not stored by us (use carefully; default No unless evidenced)
- **Required / Optional** = whether core account features need it
- **Purposes** = Play purpose labels (approx.)

| Play data type | Collected? | Shared? | Ephemeral? | Required? | Purposes | Evidence / notes |
|---|---|---|---|---|---|---|
| **Personal info → Email address** | Yes | Yes (Resend for auth email; Auth host) | No | Required for email auth | Account management | Supabase Auth + Resend SMTP |
| **Personal info → Name** | Yes if user provides display name | Possibly to Auth/AI context if included | No | Optional | Account management; App functionality | Only if entered — do not declare if never stored (`UNVERIFIED` field coverage in Production schema beyond policy text) |
| **Personal info → User IDs** | Yes | Yes (to processors as account/session identifiers when calling APIs) | No | Required | Account management; App functionality | Supabase user id; device ids for push registration |
| **Personal info → Phone number** | Yes | No | No | Optional | App functionality, Account management | `user_profiles.phone_e164`; manual entry only |
| **Financial info** | **No** | No | — | — | — | Monetization flag disabled in foundation |
| **Health & fitness** | **No** | No | — | — | — | — |
| **Messages → Emails / SMS / MIM** | **No** (app is not an email client) | — | — | — | — | Auth emails are transactional via Resend, not user mailbox collection |
| **Messages → Other in-app messages** | Yes (agent chat) | Yes (OpenAI for agent) | No | Optional (feature use) | App functionality | Chat stored in Postgres |
| **Photos and videos** | **Capacitor share intents accept `image/*`** — treat as **Yes if share-to-app is shipped and images are uploaded/stored**; otherwise do not invent server collection | Shared only if sent to backend/AI | No if stored | Optional | App functionality | Capacitor has share image intents. Whether images are persisted server-side beyond capture APIs is `UNVERIFIED` beyond “captures” mobile APIs existing — **do not declare Photos as collected in Play until persistence is confirmed for the shipped build** |
| **Audio files** | **Yes** on Capacitor / voice-enabled builds | Yes (OpenAI transcription; Storage) | No (stored then TTL) | Optional (voice feature) | App functionality | Raw audio in `recordings` bucket; TTL `processed_at + 7 days`; transcript kept. **Expo foundation: RECORD_AUDIO blocked — do not declare mic audio collection for that binary** |
| **Files and docs** | **No** undeclared general file picker collection | — | — | — | — | Do not invent |
| **Calendar** | Yes | No | No | Optional | App functionality, Personalization | `calendar_events_cache` constraints only; tokens encrypted |
| **Contacts** | **No** | — | — | — | — | Blocked on Expo; not declared on Capacitor |
| **App activity → App interactions / in-app search** | Partial — first-party telemetry events | No third-party analytics SDK | No (host logs) | Optional | Analytics / App functionality (internal diagnostics) | `logMobileEvent` + sanitize; **not** a third-party analytics share |
| **App activity → Other user-generated content** | Yes (tasks, shopping, checklists, memories, transcripts) | Yes when sent to OpenAI for agent | No | Optional / core for product value | App functionality | Postgres primary store |
| **Web browsing** | **No** | — | — | — | — | — |
| **App info and performance → Crash logs / diagnostics** | Limited first-party logs | No analytics SDK | No | Optional | Analytics (diagnostics) | Sanitized; retention `REQUIRES_DECISION` |
| **Device or other IDs** | Yes (push tokens, installation/device registration fields) | Yes at push send (FCM/APNs/Web Push) | No | Optional (push) | App functionality; Developer communications | Tokens cascade on account delete |
| **Location** | **No** | — | — | — | — | Permissions blocked / undeclared |
| **Approximate / Precise location** | **No** | — | — | — | — | — |

---

## Data type detail forms (for types marked Collected)

### Email address
- Collected: Yes · Shared: Yes (Resend / Auth) · Processed ephemerally: No  
- Required: Yes for email account  
- Purposes: Account management  
- Collection: App + server  
- Deletion: Account deletion removes Auth user  

### User IDs
- Collected: Yes · Shared: as needed for Auth/AI/push · Ephemeral: No  
- Purposes: Account management; App functionality  

### Other user-generated content (tasks, lists, chat, memories, transcripts)
- Collected: Yes · Shared: OpenAI when agent/transcription runs · Ephemeral: No  
- Purposes: App functionality  
- Deletion: Item delete or account delete (CASCADE)  

### Audio files (voice-enabled / Capacitor)
- Collected: Yes · Shared: OpenAI transcription · Ephemeral: No  
- Retention: raw audio ~7 days after processing; transcript until recording/account delete  
- Mic only after disclosure + user action  

### Device or other IDs (push)
- Collected: Yes · Shared: Web Push / optional FCM / optional APNs  
- Purposes: App functionality (reminders)  
- Notification body: generic `יש לך תזכורת ממתינה` (no task title)  

### App interactions / diagnostics (first-party)
- Collected: Yes (limited) · Shared with third-party analytics: **No**  
- Sanitization: `sanitizeTelemetryMetadata`  

---

## Explicit non-declarations (do not invent)

Do **not** mark as collected unless new evidence appears:
- Contacts, location, camera roll as a general gallery crawler, calendar, financial, health
- Advertising ID / ads personalization
- Third-party analytics SDK data sharing (GA, Firebase Analytics, etc.) — **absent**
- Household / pets / rooms entities — not in Lean product data
- Anonymous usage profiles — no anonymous users

---

## Store listing consistency checklist

| Check | Status |
|---|---|
| Privacy Policy URL live (`/privacy`) | Present |
| Account deletion URL live (`/account-deletion`) | Present |
| Data Safety matches Capacitor vs Expo binary | REQUIRES_DECISION |
| Microphone declared only if RECORD_AUDIO shipped | Align with package |
| Photos declared only if shared images are stored/processed server-side | UNVERIFIED — confirm before declaring |
| “Data is sold” | **No** |
| Children-directed | **No** |
| Operator / contact | Pelemotors / noreply@ — Play display name `REQUIRES_DECISION` |

---

## Residual risk vs Play form accuracy

| Risk | Severity | Mitigation |
|---|---|---|
| Wrong package’s permissions declared | High | Lock Play app to one applicationId; regenerate this audit for that AAB |
| Declaring Photos without server persistence proof | High | Verify captures/share pipeline before Data Safety “Photos” = Yes |
| Claiming no sharing while using OpenAI/Resend/push | High | Declare sharing with processors |
| Claiming backup instantaneous wipe | High | Policy already honest; keep Data Safety deletion text aligned |
| Host log / backup residuals | Med | Ops decisions (`REQUIRES_DECISION`) |

---

## Related internal docs

- `docs/privacy/policy-obligations.md`
- `docs/privacy/processor-inventory.md`
- `docs/privacy/data-retention-matrix.md`
- `docs/privacy/data-flow-map.md`
- `docs/privacy/android-permission-inventory.md`
- `docs/privacy/account-deletion-map.md`
- `docs/privacy/privacy-target.md`
