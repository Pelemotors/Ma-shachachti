# AI Handoff — מה שכחתי?

מקור אמת להמשך עבודה של AI/Developer.  
כל Milestone חייב לעדכן קובץ זה **לפני commit**. אין Milestone שנחשב DONE בלעדיו.

---

## Current state

- **Branch:** `main`
- **HEAD (code under final regression):** `d1b2b51593a7891711de010f1f0ffe574c82bbc7`
- **Last completed milestone:** **M15 — Agent Integration**
- **Last Play AAB:** versionCode **4** · versionName `0.1.0` · upload-key-v2  
  SHA1 `9D:0C:24:DE:FA:A6:B6:7B:F1:C4:07:6B:95:25:77:44:D1:AD:B5:01`
- **Local mobile `.env`:** Production API/Supabase for emulator (gitignored)
- **STOP GATE 1:** **DEFERRED TO FINAL REGRESSION**. This is neither a product PASS nor a product failure; the remaining manual cross-domain/Production verification is intentionally deferred.
- **QA workflow (M11–M16):** Each milestone uses Audit/Root Cause, implementation, targeted tests, relevant regressions, typecheck, and full `npm test`. Production/Emulator E2E, cleanup loops, and cross-domain manual verification are deferred to M16 Final Regression. No deploy between milestones.
- **Production deployment for M16:** `bb21c20ab795a156d4dabc9196a398836805a08f`; M9, M12, and M14 migrations are applied. Build, service, and supplied health checks passed. Production verification uses the canonical Production user and QA-only records.

---

## Last completed milestone

### M4 — Day Plan Core / Single Source of Truth ✅

**Scope:** Canonical day plan per user-scope + date; clear `updateDayPlan` vs `replanDay`; sync flexible `tasks.planned_*` with day_plan; no Create Schedule UI / Free Time / What Did I Forget / Agent rebuild.

### M5 — Create / Change Schedule ✅

**Scope:** Select today/tomorrow/other date; load the existing canonical plan; configure planning inputs and `07:00–19:00` defaults; submit explicit `replanDay`; validate before reporting success; commit and reload the canonical plan; remain on PlanComposer.

**Verified:**

- Production existing plans render routine, fixed, and flexible items.
- Date picker, today/tomorrow/other date, default and changed windows work.
- Hebrew planning context changes local planner output, including cancelled activity/free-hour behavior.
- Fixed and routine items are preserved during replan.
- Android Back with keyboard open dismisses/blur the keyboard; the next Back exits normally.
- Success is reported only after API response, DB commit, and canonical reload; the user remains on PlanComposer.
- Runtime stale `planUpdatedAt` returns `HttpError 409` without overwriting the newer plan.
- Production persistence E2E used an existing Task, confirmed the exact Task and `day_plan_item` by service-role read, then removed only those QA rows.

**M5 production note:** planning-context behavior and stale/409 were subsequently verified against the deployed Production backend using isolated QA data.

### M7 — Free Time ✅

**Scope:** Read-only contextual candidate selection for 15/30/60 minutes with optional energy. Opening the flow and requesting “משהו אחר” do not mutate Tasks or day plans. Selecting a candidate uses the existing task point-mutation API and only then creates the canonical placement.

**Root cause addressed:** The existing Free Time screen listed broad task results without excluding routines, already planned items, urgent near-term work, or closed tasks, and had no selection mutation. The candidate task was not lost in the data chain; it ranked ninth and appeared after two deterministic “משהו אחר” rotations.

**Verified:** Candidate filtering and rotation, no mutation before selection, exact QA task selection, one flexible canonical placement, task/day-plan persistence after app cold restart, and no duplicate placement. QA task and placement were deleted by exact IDs; leftovers were zero.

### M8 — What Did I Forget / Attention Queue ✅

**Root cause:** The existing `/api/forgot` flow used the generic task ranking and treated most open tasks as attention candidates. It did not exclude active routine tasks or tasks already on today's canonical plan, did not elevate missed reminders, and allowed undated/far-deadline tasks to enter merely because they existed. The mobile fallback could also replace an authoritative empty API result with a broad task-derived list.

**Fix:** The existing Attention layer now filters to meaningful attention signals: overdue/near deadlines, missed reminders, rescheduled tasks, or recorded consequences. It excludes completed/cancelled tasks, active routines, and today's planned items; it ranks very-near deadlines and missed reminders explicitly and caps the result at six. The mobile fallback is used only when the API request fails, so an authoritative empty result remains empty. No Planner, Free Time, Tasks, or day-plan architecture changed.

**Verified:** Local backend + Android Emulator showed a focused six-item feed with overdue and missed-reminder QA items, while undated, far-deadline, routine, completed, and already-planned QA items were excluded. Opening/reloading did not mutate state. Explicitly completing one QA item changed only that item. All QA tasks, the routine, and placement were removed by exact IDs; leftovers were zero. Production was not marked verified because the backend change was not deployed.

### M9 — Shopping ✅ Production verified

**Scope:** Complete Shopping lifecycle: create, inline rename, notes, auto category, Purchased, Undo Purchased, Delete, reload, and cold restart persistence. Server-confirmed responses are required before UI state changes.

**Production verification:** Production runs `444fcaa535cc4c522fb879f1a456eac48fce1299`. The M9 database migration was applied successfully. Shopping E2E, persistence, and exact QA cleanup were verified against Production; the final query for all QA titles returned zero rows.

### M10 — Checklists ✅

**Scope:** Reusable Checklist lifecycle: create, add-at-top, checkbox execution, reset, drag/reorder, duplicate, archive, delete confirmation, and task-linked checklist execution.

**Root causes addressed:** The create modal closed when Android Back dismissed the keyboard because modal close was not separated from keyboard dismissal. Checklist item creation was footer-bound and did not provide add-at-top behavior, while drag/reorder and delete confirmation were missing from the screen flow.

**Fix:** The creation modal tracks keyboard visibility and consumes Android Back while the keyboard is open. Items are created server-first and moved to the top after confirmed creation; drag/reorder persists `order_index`; delete requires explicit confirmation. Template completion remains separate from the reusable template, reset clears execution only, and duplicate remains independent.

**Verified:** Local targeted tests, M3 task-linked checklist regression, mobile typecheck, and Android Emulator E2E. A new QA Task with a real linked Checklist was created through the Tasks flow; one item remained checked after reload and cold restart. Only the exact QA records created for this run were deleted. The historical checklist `יציאה מהבית עם מיראל` was not touched.

### M11 — Recording Bank ✅ local verification

**Root cause:** The native Bank screen generated upload IDs with a direct `crypto.randomUUID()` call. That is not available in every native runtime/build target and was the source of the `Property 'crypto' doesn't exist` risk. The existing backend already persisted recording claims and background jobs, but the client exposed raw storage statuses instead of the M11 labels.

**Fix:** Added a platform-safe client ID helper with a UUID fallback, mapped `uploading/processing` to **Processing**, `ready` to **Completed**, and `error` to **Needs Review**, and added server-confirmed manual transcript correction for Needs Review. Existing private playback and retry/rerecord paths remain in place. The upload → recording processing → background job → transcription/extraction/classification/commit chain remains idempotent and persisted in Supabase, so leaving the screen or restarting does not discard work.

**Verified locally:** M11 recording-bank/recording/transcription/privacy targeted tests (40/40), root typecheck, mobile typecheck, and full `npm test` (483 pass / 7 unchanged baseline failures). Production and Emulator E2E are intentionally deferred to M16 Final Regression under the revised QA workflow.

### M12 — Notifications + Deep Links ✅ local verification

**Audit/root cause:** Task reminders were represented by Task reminder fields, while `app_notifications` was only an opened/unopened inbox. Reminder dispatch recorded notifications but used a generic `/app` route; native push response handling did not resolve entity payloads. There was no independent handled/snooze/change/cancel lifecycle, and no explicit guarantee that reminder handling leaves the linked Task open.

**Fix:** Added an additive notification lifecycle (`active`, `missed`, `snoozed`, `handled`, `cancelled`) and authenticated PATCH actions. Reminder actions update only the notification state and never complete the linked Task. Added exact entity deep-link mapping for Task, Shopping, Checklist, and standalone Notification, and changed reminder payloads/routes to target the exact Task. Existing `(user_id, logical_key)` upsert dedupe and claim locks remain the push-loop protection.

**Verified locally:** M12 targeted tests, reminder/push, task-time, mobile platform, and checklist deep-link regressions; root/mobile typecheck; and full `npm test` (487 pass / 7 unchanged baseline failures). Real Android notification-tray Push E2E is explicitly deferred to M16 Final Regression.

### M13 — Chat UI / Shortcuts ✅ local verification

**Audit/root cause:** The native Chat V4 shortcuts already use the canonical domain boundaries: Quick Task calls `createTask`, and Build Schedule opens the existing `PlanComposer` overlay. The existing add modal closes only after the awaited Task API succeeds; failures keep the modal open and show an error. Conversations, new conversation, and history use the existing session APIs. No duplicate Task or Planner implementation was added.

**Fix:** Renamed the Quick Task chip to `משימה מהירה` and added targeted contract tests covering canonical Task API routing, PlanComposer routing, server-confirmed success/error behavior, conversations, new conversation, and the existing add modal.

**Verified locally:** M13 targeted + Task/Planner/Chat regressions (73/73), root/mobile typecheck, and full `npm test` (491 pass / 7 unchanged baseline failures). Production/Emulator E2E remains deferred to M16 Final Regression.

### M14 — Settings + הבית שלי ✅ local verification

**Audit/root cause:** Settings navigation and profile persistence already existed, as did a `HouseholdScreen` for household membership and invites. There was no canonical household-context payload for adults, children, babies, rooms, bathrooms, floors, home features, pets, or free text.

**Fix:** Added additive `user_profiles.household_context` JSONB storage with bounded validation and partial-update merge semantics. Extended the existing Household screen with RTL household context fields, feature chips, pets, and free text. Saving uses the canonical profile API only; it does not create Tasks, Reminders, Routines, or day-plan items.

**Verified locally:** M14 targeted and profile/household regressions, root/mobile typecheck, `git diff --check`, and full `npm test` (495 pass / 7 unchanged baseline failures). STOP GATE 2 and Production/Emulator manual verification are deferred to M16 Final Regression.

### M15 — Agent Integration ✅ local verification

**Audit/root cause:** The Agent already routes mutations through the existing idempotent boundary: standard actions use the authenticated `execute_lean_action_idempotent` RPC, while TS-backed actions use `executeAction`. Schedule surface mutations are suppressed unless an explicit schedule-save flow handles them. Conversation history is loaded from the same owned session, and turn receipts prevent duplicate execution.

**Fix:** No parallel domain implementation was added. Added targeted contract coverage for canonical Task/Reminder/Day Plan/Shopping/Checklist action mapping, validation, server-confirmed failure/success wording, idempotent retries, stale/CAS safety, explicit replan boundaries, and multi-turn entity continuity.

**Verified locally:** M15 targeted plus Task, Day Plan, Reminder/Notification, Shopping, Checklist, and Chat regressions (81/81), root/mobile typecheck, `git diff --check`, and full `npm test` (502 pass / 7 unchanged baseline failures). Production/Emulator E2E remains deferred to M16 Final Regression.

### M16 — Final Regression ⏳ pre-production gate passed

**Production readiness:** Production now runs `bb21c20ab795a156d4dabc9196a398836805a08f`; migrations M9, M12, and M14 are applied. The supplied VPS build, service, internal/external health checks, and clean working tree passed.

**Automated final matrix:** 153 cross-domain targeted tests passed, covering Task→Schedule→Home, Chat canonical actions, notification/reminder lifecycle, recording processing, Shopping, reusable Checklists, Free Time, Attention ranking, Household context, and Agent multi-turn continuity. Root and mobile typechecks passed; `git diff --check` passed; full `npm test` reports only the same seven documented baseline failures.

**Production/Android gate:** Production is ready for the controlled final matrix. This Codex environment cannot resolve a host bridge to Cursor's host-managed ADB daemon, and must not start or restart that daemon. Therefore the Android matrix must be run once from Cursor Local against `emulator-5554`; no app mutation or QA data was created from Codex. This is a tooling limitation, not a product failure.

**Next required action:** Run one controlled Cursor Local Production/Android M16 matrix, with QA-only records and the historical checklist `יציאה מהבית עם מיראל` off limits. Do not start a new feature milestone before this gate is completed.

### M6 — Home connected to canonical Day Plan ✅

**Root cause:** Home progress count was derived from the canonical `day_plan`, but the
"עכשיו אצלך" rows applied a second filter that removed open items whose start time was
more than 15 minutes in the past. When all three canonical items were already past,
Home therefore showed `3` in the count and an incorrect empty state.

**Fix:** `buildHomeNow` still uses the canonical day plan for count and rows. It keeps
near/upcoming open items when available, and falls back to all open canonical items
when the near/upcoming set is empty. No planner, replan, persistence, navigation,
Home geometry, or design behavior changed.

**Verified:** Production canonical plan for the test user/date contained three open
items (routine, fixed, flexible). Android Home displayed the count and item titles,
then displayed the same state after pull-to-refresh and app cold restart. The empty
state is reserved for a genuinely empty canonical plan.

### Root cause

1. **Declared SoT was `day_plans` / `day_plan_items`**, with DB unique `(scope_type, scope_id, plan_date)` — already one plan per scope+date.
2. **Gaps:** `updateDayPlan` did not bump `day_plans.updated_at` (replan optimistic lock ineffective); `saveTaskPlans` **wiped** the day (dropping routine slots); `/api/schedule` skipped `ensureRoutineOccurrences` while `/api/day-plan` ran it; flexible `planned_*` could drift from day_plan after path-only day_plan writes.
3. **Not a gap:** Home/Schedule open never called `replanDay` (only explicit POST `action=replan`). Unscheduled tasks without `due_on` are not auto-added (`taskIdsForPlanDate`).

### Architecture / source of truth

| Layer | Role |
| --- | --- |
| **`day_plans` + `day_plan_items`** | Canonical schedule for `(scope_type, scope_id, plan_date)` |
| **`tasks.planned_*`** | Denormalized **mirror for flexible** non-occurrence slots only (Tasks UI). Routine occurrences do not overwrite template `planned_*`. |
| **`tasks.due_*`** | Deadline only (M2 KEEP) |
| **GET `/api/day-plan` / `/api/schedule`** | `ensureRoutineOccurrences` — materialize timed routines; **never** replan |
| **`updateDayPlan` / upsert / remove** | Point mutations of that date’s item list |
| **`replanDay`** | Explicit rebuild only (preserves existing; appends allowed ids) |

### Synchronization rules

1. After every `updateDayPlan`, flexible items without `occurrence_key` → write `tasks.planned_*`; removed flexible slots for that date → clear `planned_*` when it pointed at that date.
2. `saveTaskPlans` **merges** into existing plan (keeps `occurrence_key` / other slots); mirror via `updateDayPlan`.
3. `plan_patch` on task create/update still upserts day_plan + task fields (unchanged contract).

### updateDayPlan vs replanDay

- **`updateDayPlan`:** replace item list for one canonical plan; bump `updated_at`; sync flexible mirror. Used by upsert/remove/routine sync/saveTaskPlans merge.
- **`replanDay`:** explicit rebuild; preserves existing; appends date-relevant ids; requires POST `action=replan`. Not triggered by Home/Schedule open.

### Changes

| Path | Change |
| --- | --- |
| `lib/day-plan.ts` | race-safe getOrCreate; `syncTaskPlannedMirror`; bump `updated_at`; docs |
| `lib/actions.ts` | `saveTaskPlans` merge (no wipe) |
| `app/api/schedule/route.ts` | `ensureRoutineOccurrences` |
| `app/api/day-plan/route.ts` | comment: GET ≠ replan |
| `tests/day-plan-sot-m4.test.ts` | M4 unit tests |
| `tests/play-release-domain.test.ts` | SoT assertions updated |
| `docs/AI_HANDOFF.md` | This update |

### Prior milestones
- **M1.1** `7ba50e1…` — Android system insets  
- **M3** `95b1a28…` — Recurring + Task Checklist  
- **M2** `1fc2b5f…` — Task lifecycle  
- **M1** `356c326…` — layout/keyboard/nav  
- **M0** — baseline + 7 failures  

---

## Verification performed

| Check | Result |
| --- | --- |
| `apps/mobile` `npm run typecheck` | **PASS** |
| M8/M7/M6/M5/M4/Task/Reminder targeted tests | **97 pass / 1 baseline fail** |
| `npm test` | **480 pass / 7 fail** — same 7 baseline; no new fails |
| Android Emulator Home canonical plan | **PASS** — count/items visible; no false empty state |
| Point update → day_plan + `planned_*` sync | **PASS** |
| reload/restart | **PASS** |
| Duplicate plan per date | **PASS** (count=1) |
| Unscheduled / tomorrow not on today’s plan | **PASS** |
| Routine materialized on today | **PASS** |
| M1–M3 regression (tabs, keyboard, nav hide) | **PASS** |
| M10 targeted + M3 task-checklist regression | **27 pass** |
| M10 QA Task + linked Checklist reload/cold restart | **PASS** |

---

## Android Emulator + DB

**AVD:** `Pixel_8_Pro` · seeded Ira tasks `M4fix*` / `M4flex*` / `M4unsched*` / `M4tom*` / `M4rec*`.

| Scenario | Result |
| --- | --- |
| Today Home shows fixed+flex; not unsched/tom | PASS |
| Tasks lists unsched; flex shows שיבוץ after sync | PASS |
| `upsertDayPlanItem` → item + `planned_*` same instant | PASS |
| One `day_plans` row for user+today | PASS |
| Routine `occurrence_key` on today | PASS |
| Tomorrow item only on tomorrow plan | PASS |
| Home pull-to-refresh | PASS |
| Home app cold restart | PASS |

---

## Known issues

- Same **7 baseline** unit test failures (unchanged).
- Root Next `typecheck` noise in `.next/types` (unrelated).
- User-scope vs household-scope can both exist for the same calendar date (by design of `scope_*`).
- `classifyScheduleDay` / web `buildHomeDisplay` still task-based for some legacy web surfaces — mobile Home/Schedule use day_plan.
- Production deployment remains a manual VPS action.
- Home complete-task and schedule-time mutation scenarios were not run against historical Production data; the M6 change is read-only and refresh behavior is covered by local regression tests.

### Baseline failing tests
1. memory selector prefers user source and keyword overlap  
2. HOME fixture flags are off and live Home does not overlay demo rows  
3. tests/local-android-notifications.test.ts  
4. turn_flags suppress follow-ups without keyword regex  
5. todayContext default follows the frozen QA clock across midnight  
6. agent prompt Current date uses ProductClock, not wall time  
7. Home avatar is pressable and opens Settings (geometry preserved)

---

## KEEP / DO NOT TOUCH

### KEEP
- One canonical `day_plans` row per `(scope_type, scope_id, plan_date)`.
- GET day-plan/schedule = routine materialize only; no auto-replan.
- `due_*` ≠ `planned_*` (M2).
- Flexible `planned_*` mirror from day_plan; routines use `occurrence_key` (M3).
- Soft delete `cancelled`; M1 insets/keyboard; upload keystore v2.

### DO NOT TOUCH until later milestone
- „צור לי לו״ז” UI / „מה שונה היום” / full planning algorithm (M5).
- Agent / Notifications.
- Production deploy / Play upload.
- Home V4 flower geometry redesign.

---

## STOP GATE 1 disposition

The Tasks portion was independently verified through UI/API/Production DB evidence, but repeated final navigation was limited by emulator automation. Shopping, Checklists, Day Plan, and cross-domain manual verification are not being repeated per the revised QA workflow. The entire gate is therefore **DEFERRED TO FINAL REGRESSION**.

## Next milestone

**M16 — Production/Android final matrix pending Cursor Local execution.**

---

## Next first action

1. Run the one controlled Cursor Local M16 Production/Android final matrix with QA-only records.
2. Record QA IDs and clean only those records at the end.

---

## Important architectural decisions

1. Bottom chrome owns system inset (M1 / M1.1).
2. Task schedule SoT on row for Tasks UX mirror; day_plan is schedule SoT (M2 / M4).
3. Recurring: template Task + occurrence exceptions (M3).
4. Checklist Template ≠ Run (M3).
5. **Day plan: one scope+date → one plan; update ≠ replan (M4).**
6. Handoff-before-commit mandatory; no Push/Deploy unless requested.
