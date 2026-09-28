# AI Handoff — מה שכחתי?

מקור אמת להמשך עבודה של AI/Developer.  
כל Milestone חייב לעדכן קובץ זה **לפני commit**. אין Milestone שנחשב DONE בלעדיו.

---

## Current state

- **Branch:** `main`
- **HEAD (pre-M4):** `7ba50e107c817f20e615fbb506bad0f43a83ca4d` (M1.1) — after M4 commit this file matches the new SHA
- **Last completed milestone:** **M4 — Day Plan Core / Single Source of Truth**
- **Last Play AAB:** versionCode **4** · versionName `0.1.0` · upload-key-v2  
  SHA1 `9D:0C:24:DE:FA:A6:B6:7B:F1:C4:07:6B:95:25:77:44:D1:AD:B5:01`
- **Local mobile `.env`:** LAN Next for emulator (gitignored)
- **Stop gate:** Do **not** start M5 until human approval

---

## Last completed milestone

### M4 — Day Plan Core / Single Source of Truth ✅

**Scope:** Canonical day plan per user-scope + date; clear `updateDayPlan` vs `replanDay`; sync flexible `tasks.planned_*` with day_plan; no Create Schedule UI / Free Time / What Did I Forget / Agent rebuild.

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
| `npm test` | **456 pass / 7 fail** — same 7 baseline; +M4 tests; no new fails |
| Android Emulator Home/Tasks consistency | **PASS** |
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

---

## Known issues

- Same **7 baseline** unit test failures (unchanged).
- Root Next `typecheck` noise in `.next/types` (unrelated).
- User-scope vs household-scope can both exist for the same calendar date (by design of `scope_*`).
- `classifyScheduleDay` / web `buildHomeDisplay` still task-based for some legacy web surfaces — mobile Home/Schedule use day_plan.
- Create Schedule UI / planning algorithm / Free Time / What Did I Forget / Agent deferred to M5+.

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
- Free Time / What Did I Forget / Agent / Notifications.
- Production deploy / Play upload.
- Home V4 flower geometry redesign.

---

## Next milestone

**M5 — Create / Change Schedule.** Do not start until explicitly approved.

---

## Next first action

1. Wait for human approval of M4.
2. On approval, read this handoff and the M5 brief.
3. First M5 action: wire Create/Change Schedule UI to explicit `replanDay` + context field — without breaking the M4 SoT invariants.

---

## Important architectural decisions

1. Bottom chrome owns system inset (M1 / M1.1).
2. Task schedule SoT on row for Tasks UX mirror; day_plan is schedule SoT (M2 / M4).
3. Recurring: template Task + occurrence exceptions (M3).
4. Checklist Template ≠ Run (M3).
5. **Day plan: one scope+date → one plan; update ≠ replan (M4).**
6. Handoff-before-commit mandatory; no Push/Deploy unless requested.
