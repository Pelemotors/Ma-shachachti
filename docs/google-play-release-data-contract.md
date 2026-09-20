# Google Play Release Data Contract

**App:** מה שכחתי?  
**Package:** `com.mashachachti.app` (Expo native; no WebView)  
**Policy version:** `2026-09-20`  
**URLs:** https://mashachachti.co.il/privacy · https://mashachachti.co.il/account-deletion  
**Production Supabase:** SELF_HOSTED `https://supabase.mashachachti.co.il`

Declarations below are the Play Console contract. Implementation evidence is updated as code lands.

| Data type | Collected | Shared | Ephemeral | Required/Optional | Declared purposes | Code path | DB | Retention | Deletion | Processor | Android permission | Verified | Test |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Name | Yes | No | No | Optional | App functionality, Personalization, Account management | `/api/profile` | `user_profiles.display_name` | Until clear/account delete | Profile clear + account delete | Self-hosted Auth/DB | none | Code | privacy-compliance / profile |
| Email address | Yes | No | No | Required | Account management | Supabase Auth | `auth.users.email` | Until account delete | `deleteUser` | Resend (auth mail; service-provider) | none | Code | account-deletion |
| User IDs | Yes | No | No | Required | App functionality, Security/Compliance, Account management | Auth session | `auth.users.id` | Until account delete | cascade | none beyond host | none | Code | RLS |
| Phone number | Yes | No | No | Optional | App functionality, Account management | `/api/profile` | `user_profiles.phone_e164` | Until clear/account delete | profile + delete | none | none (manual entry) | Code | phone-normalize |
| Other in-app messages | Yes | No | No | Optional | App functionality, Personalization | `/api/chat` | `chat_sessions`, `chat_messages` | Until delete | cascade | OpenAI (service-provider) | none | Code | chat isolation |
| Voice recordings | Yes | No | No | Optional | App functionality | `/api/recordings` | `recordings` + storage | Raw audio ≤7d after transcription | cron + account delete | OpenAI STT | RECORD_AUDIO | Code | audio retention |
| Calendar events | Yes | No | No | Optional | App functionality, Personalization | `/api/calendar` | `calendar_events_cache` | Until disconnect/delete | disconnect + delete | Google Calendar API | none (OAuth, not READ_CALENDAR) | Code | calendar mapper |
| Diagnostics | Yes | No | No | Required | Analytics | `/api/telemetry` | host logs / `telemetry_events` | ops | not user-content | none | none | Code | sanitizer |
| App interactions | Yes | No | No | Required | Analytics | `/api/telemetry` | same | ops | semantic events only | none | none | Code | sanitizer |
| Other user-generated content | Yes | No | No | Optional | App functionality, Personalization | tasks/lists/memory/day_plan | Lean tables + `day_plans` | Until user/account delete | CRUD + delete | OpenAI when agent runs | none | Code | ownership |
| Device / installation IDs | Yes | No | No | Optional | App functionality, Developer communications, Personalization | `/api/devices` | `user_installations` | Until revoke/logout/delete | revoke + delete | FCM/APNs if push opted-in | POST_NOTIFICATIONS if opt-in | Code | push-token |

**Also declared**

- HTTPS / encryption in transit.
- Account deletion exists at the URL above.
- No ads. No Advertising ID. No Location. No Contacts. No Financial. No Health/Fitness features.
- Calendar integration is optional. App works without it.
- No third-party analytics SDK.
- Shared = No under service-provider exception — **HUMAN RELEASE CHECK** (legal), not a code PASS.
- Users may delete the account. No external formal partial-deletion URL.
- `day_plan` is the only schedule source of truth. `tasks.planned_*` is legacy read-only if present.
- Calendar cache is planning constraints only; no automatic `day_plan_item` from events.
- Calendar OAuth tokens encrypted at rest; key outside DB/Git.

**Gates**

- `CODE_DEPLOY_GATE` — required for Production deploy.
- `PLAY_RELEASE_READY_GATE` — required to declare Google Play Release Ready (fails until live OAuth/Calendar credentials).
