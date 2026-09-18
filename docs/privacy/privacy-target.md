# Privacy Target — מה שכחתי?

**Policy version:** `2026-09-18`  
**Status:** Product decisions for Android / Google Play readiness  
**Based on:** Phase 1 factual inventory (Production DB + code)

## Resolved decisions

| Topic | Decision | Enforcement |
|--------|----------|-------------|
| Operator | Pelemotors (GitHub org owning the product) | Stated in Privacy Policy |
| Contact | `noreply@mashachachti.co.il` (only address present in Production config / VAPID) | Stated in Policy; dedicated privacy@ mailbox = future improvement |
| Anonymous accounts | Not offered | No guest auth |
| Raw audio retention | Deleted within **7 days** after transcription completes (`delete_after`) | Cron `/api/cron/recordings` + `cleanupExpiredRecordings` |
| Transcript retention | Kept until user deletes the recording row or deletes the account | No TTL on transcript field |
| Account deletion | Authenticated self-service (`POST /api/account/delete` with `confirm: "DELETE"`) | Must purge Storage objects then `auth.admin.deleteUser` (CASCADE) |
| Survives deletion | `account_audit` rows with `user_id` set NULL | Documented |
| Backups | Manual host dumps may retain deleted data until dump rotation | Documented honestly; no claim of instant backup purge |
| Push content | Lock-screen body is **generic** (no task title) | `lib/reminder-dispatch.ts` |
| Children | App is **not** directed at children | No specific age claimed |
| Selling data | We do **not** sell personal data | Processors used only to operate the service |
| Mic | Starts only after explicit user action + in-app disclosure before first OS prompt | Web + mobile |

## Explicit non-claims

- We do **not** claim “we never share with anyone” — processors receive data to operate the service.
- We do **not** claim instant purge from all backups.
- We do **not** claim OpenAI / Resend / FCM retain nothing; their retention follows their policies.
- Household/pets/rooms product entities are **not** in Lean — not listed as collected product data.

## Remaining REQUIRES_DECISION (non-blocking for policy if phrased carefully)

1. Dedicated privacy mailbox vs `noreply@`.
2. Automated backup retention / rotation schedule (ops).
3. Host process-log retention window.
4. Whether Play Console developer display name differs from “Pelemotors”.
