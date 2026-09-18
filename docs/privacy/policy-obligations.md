# Policy obligations matrix — מה שכחתי?

**Policy version:** `2026-09-18`  
**Policy URL:** https://mashachachti.co.il/privacy  
**Account deletion URL:** https://mashachachti.co.il/account-deletion  
**Operator:** Pelemotors · Contact: `noreply@mashachachti.co.il`  
**Scope:** Obligations stated in the published Privacy Policy vs expected/actual system behaviour.

Status legend: `Aligned` | `Partial` | `Gap` | `REQUIRES_DECISION` | `UNVERIFIED`

| Policy statement | Expected system behaviour | Evidence required | Actual behaviour | Current status | Gap | Severity | Required fix |
|---|---|---|---|---|---|---|---|
| Operator is Pelemotors; contact `noreply@mashachachti.co.il` | Policy and Play/store listings identify the same operator and a reachable contact | Policy page; Play Console developer name | Policy states Pelemotors + noreply@. Play Console display name vs Pelemotors | Partial | Play developer display name may differ | Low | Confirm Play Console name (`REQUIRES_DECISION`) or align listing text |
| No anonymous / guest users | All product APIs require authenticated Supabase user; no guest auth path | Auth routes; absence of anon product flows | Auth via Supabase; native Apple/Google via `/api/auth/native`; no anonymous users offered | Aligned | — | — | — |
| Mic starts only after explicit user action + in-app disclosure before first OS prompt | Gate before `getUserMedia` / native mic permission | Web disclosure helper; Expo modal; recorder hooks | Web: `ensureMicDisclosureAccepted` before `getUserMedia`; Expo: `MicDisclosureModal` / mic disclosure gate | Aligned | — | — | — |
| Raw audio deleted ~7 days after transcription completes | Set `delete_after = processed_at + 7 days`; cron removes Storage object | `readyTimes`; `/api/cron/recordings`; `cleanupExpiredRecordings` | `delete_after` set at ready; cron calls `cleanupExpiredRecordings`; transcript retained | Aligned | — | — | — |
| Transcript kept until recording or account deleted | No TTL on transcript field; cascade/row delete only | Schema; delete flows | Transcript stored on `recordings`; no automatic transcript purge TTL | Aligned | — | — | — |
| Account deletion available at `/account-deletion` and in-app after login | Authenticated `POST /api/account/delete` with `confirm: "DELETE"` | Route + UI clients | Web client + Expo Privacy settings call delete API; confirm literal `DELETE` | Aligned | — | — | — |
| Account delete purges Storage recordings then deletes auth user | Fail closed if Storage purge partial; then `auth.admin.deleteUser` | `lib/account/delete-account.ts` | Purges `recordings` bucket objects; hard error if any Storage remove fails; then `deleteUser` | Aligned | — | — | — |
| Postgres product rows cascade from `auth.users` except `account_audit` | `ON DELETE CASCADE` on user-owned tables; `account_audit.user_id` `SET NULL` | Migrations | Cascade on product tables; `account_audit` SET NULL; audit insert before delete | Aligned | — | — | — |
| Push lock-screen body is generic (no task title) | Reminder payload body must not include task title | `lib/reminder-dispatch.ts` | Lock body fixed: `יש לך תזכורת ממתינה` | Aligned | — | — | — |
| Processors: Supabase, OpenAI, Resend, Push (Web Push / FCM / APNs), Apple/Google for native auth | Only listed processors receive data needed to operate service | Code + env wiring | Supabase (auth/DB/Storage); OpenAI agent + transcription; Resend via Supabase SMTP; web-push + optional FCM/APNs; native auth | Aligned | Processor retention at vendor side is outside our purge | Med | Document honestly (already in policy); no code claim of vendor wipe |
| We do not sell personal data | No sale / ads SDK monetization path | Product code; feature flags | No third-party analytics SDK; monetization flag present as disabled in foundation migration | Aligned | Future monetization would reopen obligation | Low | Keep flag/policy in sync if monetization ships |
| No third-party analytics SDK | Telemetry only via first-party `logMobileEvent` + sanitize | Observability + package deps | `sanitizeTelemetryMetadata` strips sensitive keys; console/server log path; no GA-class SDK declared | Aligned | Host log retention window | Med | Define host process-log retention (`REQUIRES_DECISION`) |
| RLS on public tables; `service_role` server-side only | Client uses anon/authenticated keys; admin ops use server service role | Migrations; server auth helpers | RLS enabled on public tables; service_role used server-side for privileged ops | Aligned | — | — | — |
| Storage bucket is recordings-only for user audio | Only `recordings` bucket holds user audio objects | Storage usage in delete/purge + upload paths | Account delete and retention target bucket `recordings` | Aligned | Other buckets existence | Low | Confirm no other user-content buckets in Production (`UNVERIFIED` if not re-checked on host) |
| Backups may retain deleted data until dump rotation; no instant backup purge | Ops docs must not claim immediate backup erase | Backup location + purge process | Manual dumps under `/srv/ira/ma-shachachti/backups`; no automated purge of deleted users from dumps | Partial | No automated backup rotation/purge schedule documented as enforced | High | Define and document backup retention/rotation (`REQUIRES_DECISION`) |
| App not directed at children | No child-directed UX; no knowingly collecting children’s data | Policy + product positioning | Policy states not for children; no specific age gate implemented | Partial | No age claim / gate | Low | Age wording / gate is `REQUIRES_DECISION` if stores require it |
| Android permissions: mic, notifications, internet; no contacts/location in current product | Manifest/permissions match declared use | Capacitor + Expo manifests/config | Capacitor (`il.co.mashachachti.app`): INTERNET, RECORD_AUDIO, POST_NOTIFICATIONS + share image intents. Expo foundation (`com.mashachachti.app`): INTERNET, VIBRATE; blocks storage/camera/location/contacts/RECORD_AUDIO | Aligned for stated builds | Two Android package IDs / permission sets | Med | Ensure Play Data Safety + listing match the store binary actually shipped |

## Cross-cutting unknowns

| Item | Classification | Notes |
|---|---|---|
| Dedicated `privacy@` mailbox | REQUIRES_DECISION | Policy currently uses `noreply@mashachachti.co.il` |
| Automated backup retention schedule | REQUIRES_DECISION | Manual dumps exist; purge of deleted users from dumps not automated |
| Host process-log retention window | REQUIRES_DECISION | Telemetry goes to server logs via `logMobileEvent` |
| OpenAI / Resend / FCM / APNs retention of payloads | UNVERIFIED (vendor policy) | Policy correctly defers to vendor policies |
| Which Android binary is published to Play | REQUIRES_DECISION | Capacitor vs Expo foundation have different package IDs and permissions |

## Related docs

- `processor-inventory.md`
- `data-retention-matrix.md`
- `data-flow-map.md`
- `android-permission-inventory.md`
- `account-deletion-map.md`
- `../google-play-data-safety-audit.md`
- `privacy-target.md`
