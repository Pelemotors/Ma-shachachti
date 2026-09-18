# Data flow map — מה שכחתי?

**Policy version:** `2026-09-18`  
**Product:** מה שכחתי? · https://mashachachti.co.il  
**Operator:** Pelemotors

This map describes evidenced flows only. Optional paths are labeled. Unknowns marked `UNVERIFIED` / `REQUIRES_DECISION`.

## Trust boundaries

```
[Client: Web / Capacitor Android / Expo mobile]
        | HTTPS
        v
[Next.js app APIs + server libs]  --service_role-->  [Self-hosted Supabase: Auth | Postgres | Storage]
        |
        +--> OpenAI (agent + transcription)
        +--> web-push / optional FCM / optional APNs
        |
[Supabase Auth SMTP] --> Resend
```

- Client never holds `service_role`.
- RLS protects public tables for authenticated users.
- No anonymous product users.

---

## 1. Authentication flows

### 1.1 Email auth

```
User email/password (or reset)
  -> Supabase Auth
  -> Auth emails via Resend SMTP
  -> Session cookies/tokens to client
```

**Data:** email, auth secrets/hashes (Auth), email message content (Resend).

### 1.2 Native Apple / Google

```
Native SDK identity token
  -> POST /api/auth/native
  -> Supabase session established
  -> optional logMobileEvent (LOGIN_*)
```

**Data:** provider identity token / claims needed for auth; no anonymous fallback.

---

## 2. Product content (CRUD)

```
Authenticated client
  -> App APIs / Supabase client (RLS)
  -> Postgres tables (tasks, shopping, checklists, chat, memories, prefs, …)
```

**Outbound to OpenAI (agent path):** selected conversation text + relevant context (open tasks/memories as required for the action) → OpenAI → structured actions written back to Postgres.

---

## 3. Voice / recordings

```
User explicit mic action
  -> in-app mic disclosure (first time)
  -> OS mic permission
  -> capture audio
  -> upload to Storage bucket `recordings` + recordings row
  -> transcription via OpenAI
  -> transcript stored; delete_after = processed_at + 7d
  -> cron cleanupExpiredRecordings removes raw audio object
```

**Clients:**
- Web / Capacitor: `ensureMicDisclosureAccepted` before `getUserMedia`.
- Expo: `MicDisclosureModal` / mic disclosure gate (foundation may still block `RECORD_AUDIO` at OS permission list until feature enabled).

---

## 4. Push reminders

```
Reminder scheduler (server)
  -> load due tasks
  -> build payload (title "מה שכחתי?", body "יש לך תזכורת ממתינה")
  -> record notification row
  -> deliver via web-push and/or optional FCM/APNs using stored device tokens
```

**Privacy control:** lock-screen body does not include task title.

---

## 5. Telemetry

```
Mobile/server events
  -> sanitizeTelemetryMetadata
  -> logMobileEvent (host logs)
```

**Not present:** third-party analytics SDK export path.

---

## 6. Account deletion

```
Authenticated POST /api/account/delete { confirm: "DELETE" }
  -> purge Storage objects in `recordings` for user (fail closed)
  -> insert account_audit (account.delete_requested)
  -> auth.admin.deleteUser
  -> Postgres CASCADE on user-owned tables
  -> account_audit.user_id SET NULL
```

**Survives:** de-linked audit rows; manual backup dumps; vendor-side copies (`UNVERIFIED` retention).

UI entry points: https://mashachachti.co.il/account-deletion and in-app settings (after login).

---

## 7. Backups (ops)

```
Manual dumps -> /srv/ira/ma-shachachti/backups
```

No automated flow purges deleted users from historical dumps (`REQUIRES_DECISION` for rotation policy).

---

## Entity → destination cheat sheet

| Entity | Destinations |
|---|---|
| Email / account | Supabase Auth; Resend (auth mail) |
| Tasks / lists / chat / memories | Postgres; OpenAI when agent invoked |
| Raw audio | Storage `recordings`; OpenAI transcription |
| Transcript | Postgres; may be re-sent to agent later |
| Push token | Postgres; FCM/APNs/Web Push at send time |
| Reminder lock text | Push vendors (generic body) |
| Telemetry metadata (sanitized) | Host logs |
| Audit delete event | Postgres `account_audit` |

## Android package note

Two Android identities exist in repo:
- Capacitor: `il.co.mashachachti.app` (mic + notifications permissions declared)
- Expo foundation: `com.mashachachti.app` (mic blocked at foundation)

Which binary is the Play-store artifact is `REQUIRES_DECISION` for store disclosures, but both talk to the same backend trust boundary above when using production APIs.
