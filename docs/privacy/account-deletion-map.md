# Account deletion map — מה שכחתי?

**Policy version:** `2026-09-18`  
**User-facing URL:** https://mashachachti.co.il/account-deletion  
**Privacy policy:** https://mashachachti.co.il/privacy  
**Operator contact:** `noreply@mashachachti.co.il`

## Entry points

| Surface | Behaviour |
|---|---|
| `/account-deletion` | Authenticated self-service UI; user must type `DELETE` |
| In-app settings (web) | Link to account-deletion |
| Expo Privacy settings | Calls `POST /api/account/delete` with `{ confirm: "DELETE" }` |
| API | `POST /api/account/delete` — Zod requires literal `confirm: "DELETE"`; authenticated |

Anonymous deletion is not offered (no anonymous users).

---

## Server sequence (`lib/account/delete-account.ts`)

```
1. purgeUserRecordingObjects(admin, userId)
     - Select recordings.storage_path for user
     - List Storage prefix userId/ in bucket `recordings`
     - storage.remove in chunks of 100
     - If any chunk fails → HttpError 503; account NOT deleted
2. Insert account_audit { event: account.delete_requested, metadata… }
     - Failure → 503; account NOT deleted
3. auth.admin.deleteUser(userId)
     - Failure → 503
4. Return { ok, storageRemoved, storageFailed }
```

**Fail-closed rule:** partial Storage failure does not claim full deletion.

---

## Database cascade map

| Object | On `auth.users` delete | Result for user data |
|---|---|---|
| User-owned Postgres tables (`user_id` → `auth.users`) | `ON DELETE CASCADE` | Rows removed |
| `account_audit.user_id` | `ON DELETE SET NULL` | Audit row kept, identity unlinked |
| Auth sessions / identities | Removed with Auth user | Login impossible |

Product tables with CASCADE (evidenced in migrations) include, among others: tasks/memory family, shopping/checklists, chat sessions/messages, recordings, notifications/devices-related mobile foundation tables, lean profiles — all `user_id` FK cascade except `account_audit`.

RLS remains irrelevant after user deletion because rows are gone (or de-linked for audit).

---

## Storage

| Item | Detail |
|---|---|
| Bucket | `recordings` only |
| Paths | Prefer `userId/...` objects listed from DB + Storage list |
| Account delete | Explicit purge before Auth delete |
| TTL path | Separate cron may already have removed expired raw audio; transcript rows still cascade |

---

## What is deleted vs retained

### Deleted (as far as primary systems allow)

- Auth user and sessions
- Cascaded product data (tasks, lists, chat, memories, recordings rows, devices/push rows, etc.)
- Remaining Storage audio objects for that user (must succeed)

### Retained / may remain

| Residual | Classification | Notes |
|---|---|---|
| `account_audit` rows with `user_id` NULL | By design | Security/ops audit |
| Manual backups under `/srv/ira/ma-shachachti/backups` | Documented residual | No automated purge of deleted users from dumps |
| OpenAI processing copies | Vendor residual | `UNVERIFIED` retention; policy discloses |
| Resend email logs | Vendor residual | `UNVERIFIED` |
| Push provider ephemeral delivery logs | Vendor residual | `UNVERIFIED` |
| Host telemetry logs (`logMobileEvent`) | Ops residual | Retention window `REQUIRES_DECISION` |

---

## Related non-delete controls

| Control | Relation to deletion |
|---|---|
| Raw audio 7-day TTL | Reduces Storage residue before account delete; does not replace account delete |
| Per-recording DELETE API | User can remove individual recordings earlier |
| Push unsubscribe / device APIs | Can remove tokens without full account delete |

---

## Verification checklist (ops)

1. Call delete as the user; confirm Auth user gone.
2. Confirm no rows with that `user_id` in cascaded tables.
3. Confirm no objects under `recordings/{userId}/`.
4. Confirm `account_audit` has de-linked event.
5. Confirm backups still may contain pre-delete dump (`REQUIRES_DECISION` rotation).

## Open items

| Item | Classification |
|---|---|
| Backup rotation that eventually drops deleted-user copies | REQUIRES_DECISION |
| Export-before-delete UX completeness | UNVERIFIED beyond existence of `/api/account/export` mention in readiness docs — not part of FACTS delete path |
| Cross-region vendor erasure SLAs | UNVERIFIED |
