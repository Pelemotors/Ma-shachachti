# AI Handoff — מה שכחתי?

מקור אמת להמשך עבודה של AI/Developer.  
כל Milestone חייב לעדכן קובץ זה **לפני commit**. אין Milestone שנחשב DONE בלעדיו.

---

## Current state

- **Branch:** `main`
- **HEAD:** `09b71242d76c3727b439fdbe856dc0852b8d671a` לפני commit M8
- **Last completed milestone:** **M8 — What Did I Forget / Attention Queue**
- **Last Play AAB:** versionCode **4** · versionName `0.1.0` · upload-key-v2  
  SHA1 `9D:0C:24:DE:FA:A6:B6:7B:F1:C4:07:6B:95:25:77:44:D1:AD:B5:01`
- **Local mobile `.env`:** Production API/Supabase for emulator (gitignored)
- **Stop gate:** Do **not** start M9 until human approval

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
| `npm test` | **471 pass / 7 fail** — same 7 baseline; no new fails |
| Android Emulator Home canonical plan | **PASS** — count/items visible; no false empty state |
| Point update → day_plan + `planned_*` sync | **PASS** |
| reload/restart | **PASS** |
| Duplicate plan per date | **PASS** (count=1) |
| Unscheduled / tomorrow not on today’s plan | **PASS** |
| Routine materialized on today | **PASS** |
| M1–M3 regression (tabs, keyboard, nav hide) | **PASS** |

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

## Next milestone

**M9 — next milestone.** Do not start until explicitly approved.

---

## Next first action

1. Wait for human approval of M9.
2. On approval, read this handoff and the M9 brief.

---

## Important architectural decisions

1. Bottom chrome owns system inset (M1 / M1.1).
2. Task schedule SoT on row for Tasks UX mirror; day_plan is schedule SoT (M2 / M4).
3. Recurring: template Task + occurrence exceptions (M3).
4. Checklist Template ≠ Run (M3).
5. **Day plan: one scope+date → one plan; update ≠ replan (M4).**
6. Handoff-before-commit mandatory; no Push/Deploy unless requested.
