# Google Play Release — Gap Analysis

**Starting SHA:** `c04d38ba478c03c1169d6d1ca174da0c694ae77e`  
**Package:** `com.mashachachti.app`  
**Date:** 2026-09-20 (post-implementation)

Status values: PASS / PARTIAL / MISSING / CONFLICT / HUMAN RELEASE CHECK

| Requirement | Status | Evidence |
|---|---|---|
| Email account | PASS | Supabase Auth + Expo email/password gate |
| User IDs + isolation | PASS | RLS Lean + new household/day_plan/calendar/jobs policies |
| Name optional | PASS | `display_name` optional; app works without name |
| Phone optional | PASS | `user_profiles.phone_e164` + profile API + settings |
| In-app messages | PASS | chat APIs + Expo ChatScreen |
| Voice + 7d raw audio | PASS | Expo mic disclosure + upload `/api/recordings`; cron 7d |
| Calendar | PARTIAL | encrypted connections + cache constraints; live OAuth HUMAN RELEASE CHECK |
| Diagnostics / app interactions | PASS | first-party allowlist in `lib/observability.ts` |
| UGC tasks/lists/memory | PASS | APIs + household ownership rules |
| Device IDs optional | PASS | push/device register after opt-in only |
| Account deletion | PASS | household leave/transfer + calendar revoke + jobs/day_plans |
| Privacy page | PASS | version `2026-09-20` phone/household/calendar/telemetry |
| Household / couple | PASS | schema + API + Expo HouseholdScreen (max 2) |
| day_plan SoT | PASS | `day_plans` only; `planned_*` not written by schedule/agent plan_patch |
| Durable bank/brain-dump jobs | PASS | `background_jobs` + `/api/cron/jobs` |
| Google/Apple Sign-In Android | HUMAN RELEASE CHECK | UI disabled; not shown as working |
| Expo product screens | PASS | Tasks/Chat/Lists/Plan/FreeTime/Bank/Household/Calendar/Privacy |
| No AD_ID / Location / Contacts | PASS | app.config blockedPermissions + manifest remove |
| Push generic lock screen | PASS | `יש לך תזכורת ממתינה` |
| Shared=No legal | HUMAN RELEASE CHECK | processors exist; legal DPA evidence not in repo |
| Play Ready (live OAuth/Calendar) | FAIL | Gate B until credentials planted |

Do not declare Google Play Release Ready while Gate B is FAIL.
