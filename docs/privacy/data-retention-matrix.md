# Data retention matrix — מה שכחתי?

**Policy version:** `2026-09-18`  
**Operator:** Pelemotors · Contact: `noreply@mashachachti.co.il`

Retention is stated only where evidenced. Unknown windows are `REQUIRES_DECISION` or `UNVERIFIED`.

## Matrix

| Data class | Storage location | Retention trigger / TTL | Delete mechanism | Survives account delete? | Notes |
|---|---|---|---|---|---|
| Auth user (`auth.users`) | Supabase Auth (Postgres) | Until account delete | `auth.admin.deleteUser` after Storage purge | No (deleted) | No anonymous users |
| Product rows (tasks, shopping, checklists, chat, memories, recordings metadata, devices, push, notifications, profiles, etc.) | Postgres `public.*` | Until user deletes item or account | Row delete APIs and/or `ON DELETE CASCADE` from `auth.users` | No (cascade) | RLS on public tables |
| `account_audit` | Postgres | Operational / security keep | `user_id` set `NULL` on user delete; row kept | Yes (de-linked) | Inserted before `deleteUser` on self-service delete |
| Raw audio object | Storage bucket `recordings` | `delete_after = processed_at + 7 days` after transcription ready | Cron `/api/cron/recordings` → `cleanupExpiredRecordings`; also purged on account delete | No (explicit Storage purge before user delete) | Transcript not deleted by audio TTL |
| Transcript text | `recordings.transcript` (Postgres) | Until recording row deleted or account deleted | Recording DELETE / CASCADE | No | No separate transcript TTL |
| Recording metadata (status, mime, duration, errors, origin, …) | Postgres `recordings` | Same as transcript | Same | No | — |
| Agent chat / memories / tasks content previously sent to OpenAI | OpenAI (vendor) | Vendor policy | Not controlled by our delete API | Possibly | Policy does not claim vendor wipe |
| Auth emails | Resend (SMTP) | Vendor policy | Not controlled by our delete API | Possibly | Email + auth links |
| Push tokens / device registration | Postgres | Until unregister, logout flows, or account delete | CASCADE / device APIs | No | — |
| Push notification content at FCM/APNs/Web Push | Vendor push infra | Vendor/ephemeral delivery | N/A | Possibly briefly | Lock body generic: `יש לך תזכורת ממתינה` |
| First-party telemetry events | Host process logs via `logMobileEvent` | `REQUIRES_DECISION` | Ops log rotation | Possibly | Sanitized metadata only |
| Manual DB/Storage dumps | `/srv/ira/ma-shachachti/backups` | Until manual dump rotation | No automated purge of deleted users | Yes, until dump rotated | Documented honestly in policy |

## Audio retention detail

1. On transcription ready, system sets `processed_at` and `delete_after = processed_at + 7 days` (`readyTimes`).
2. Cron invokes `cleanupExpiredRecordings` for rows due (`delete_after <= now`), removing Storage objects and marking audio deleted while keeping transcript/row per product logic.
3. Account deletion always attempts Storage purge for remaining objects under the user before `deleteUser`; partial Storage failure aborts account deletion (fail closed).

## Account-level retention summary

| On successful account delete | Result |
|---|---|
| Auth identity + sessions | Removed |
| Cascaded product tables | Removed |
| Storage `recordings` objects for user | Removed (required success) |
| `account_audit` | Retained with `user_id` NULL |
| Backups | May still contain prior copies |
| OpenAI / Resend / push vendors | Outside automated purge |

## Gaps / decisions

| Item | Classification | Severity |
|---|---|---|
| Automated backup retention/rotation schedule | REQUIRES_DECISION | High |
| Host log retention for `logMobileEvent` | REQUIRES_DECISION | Medium |
| Vendor-side retention (OpenAI, Resend, FCM/APNs) | UNVERIFIED | Medium (disclosure only) |
| Whether any non-`recordings` Storage objects exist for users | UNVERIFIED if Production buckets not re-audited | Low |
