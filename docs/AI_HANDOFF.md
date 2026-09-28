# AI Handoff — מה שכחתי?

מקור אמת להמשך עבודה של AI/Developer.  
כל Milestone חייב לעדכן קובץ זה **לפני commit**. אין Milestone שנחשב DONE בלעדיו.

---

## Current state

- **Branch:** `main`
- **HEAD (pre-M3):** `1fc2b5fc3bfb2e919cc0cca90e014dadb2e2aa18` (M2) — after M3 commit this file matches the new SHA
- **Last completed milestone:** **M3 — Recurring Tasks + Task Checklist**
- **Last Play AAB:** versionCode **4** · versionName `0.1.0` · upload-key-v2  
  SHA1 `9D:0C:24:DE:FA:A6:B6:7B:F1:C4:07:6B:95:25:77:44:D1:AD:B5:01`
- **Local mobile `.env`:** LAN Next for emulator (gitignored)
- **Stop gate:** Do **not** start M4 until human approval

---

## Last completed milestone

### M3 — Recurring Tasks + Task Checklist ✅

**Scope:** Recurring Tasks lifecycle + Task↔Checklist binding only. No Day Plan, Planner, Home planning, Free Time, „מה שכחתי?”, Shopping redesign, Agent, or Notifications.

### Root cause

1. **Recurring backend already existed** (`routines` + `routine_occurrence_exceptions`) and create/update/stop worked — but the mobile „קבועות” checkbox treated a routine Task like a normal Task complete, and **did not load today’s exceptions**, so occurrence-done did not show / round-trip correctly.
2. **Task editor could link an existing checklist** but had **no „חדש” path** to create a real checklist from the Task; opening checklist from Tasks returned to the global Checklists overlay instead of Tasks.
3. Save button in the Task modal was easy to miss at the bottom edge (padding) — fixed as part of editor UX reliability.

**Model kept (no new architecture):** Task template stays open; occurrence done/skip/override lives in `routine_occurrence_exceptions`. Checklist Template ≠ Run (`checklist_runs` / `checklist_run_items`).

---

## Changes made

### M3 files
| Path | Change |
| --- | --- |
| `lib/routines.ts` | `loadRoutineExceptionsForDate` |
| `app/api/routines/route.ts` | GET returns `exceptions` + `date` (Jerusalem today default) |
| `apps/mobile/src/api/routines.ts` | types + `listRoutines(date?)` |
| `apps/mobile/src/screens/TasksScreen.tsx` | exceptions → occurrence checkbox / „בוצע היום”; create checklist „חדש”; open after save; modal bottom padding; routine complete uses occurrence_date only |
| `apps/mobile/src/navigation/ProductShell.tsx` | `checklistReturnTo` tasks vs checklists |
| `tests/task-recurring-checklist-m3.test.ts` | M3 unit tests (3) |
| `docs/AI_HANDOFF.md` | This update |

### Recurring implementation
- Persist via existing `routines` row (`weekdays`, `time_of_day`, `active`).
- Edit = `updateRoutine`; cancel recurrence = `stopRoutine` → `active=false`, Task remains `open`.
- „קבועות” = active routines only.
- Complete on a recurring Task marks **today’s occurrence** (`done` exception), does **not** close the template Task.

### Task checklist implementation
- Link via `tasks.checklist_id` (existing).
- „חדש” calls `createChecklist` and optionally opens detail after save.
- Items/toggles use existing checklist APIs; checked state on **run** (`occurrence_key=standalone` for general run), template texts unchanged.
- Back from checklist opened from Tasks returns to Tasks tab.

### Prior milestones (archive)
- **M2** — Task lifecycle + deadline≠schedule (commit `1fc2b5f…`)
- **M1** — layout / keyboard / nav (commit `356c326…`)
- **M0** — baseline + 7 known test failures

---

## Verification performed

| Check | Result |
| --- | --- |
| `apps/mobile` `npm run typecheck` | **PASS** |
| `npm test` (root) | **445 pass / 7 fail** — same 7 baseline failures; +3 M3 tests pass; no new fails |
| Android Emulator M3 recurring + checklist | **PASS** |
| Persistence vs Supabase | **PASS** — routines / checklist_id / items / run_items |
| M1/M2 regression (create/complete/undo/delete, tabs, keyboard) | **PASS** |

---

## Android Emulator verification

**AVD:** `Pixel_8_Pro` · **device:** `emulator-5554` · portrait · API via LAN Next `:3000`.

### Recurring
| Scenario | Result |
| --- | --- |
| Create recurring Task → DB routine | PASS |
| Reload / restart — recurrence kept | PASS |
| Appears in „קבועות” while active | PASS |
| Edit weekdays → DB updated | PASS |
| Cancel recurrence → `active=false`, Task stays open | PASS |
| After cancel — not in „קבועות” | PASS |
| No duplicate Tasks | PASS |

### Task Checklist
| Scenario | Result |
| --- | --- |
| Task linked to checklist (`checklist_id`) | PASS |
| Add 2 items → DB template items | PASS |
| Toggle item → run_items checked | PASS |
| Restart — checked persists on run | PASS |
| Undo toggle | PASS |
| Delete item → persists after restart | PASS |

### Regression
| Scenario | Result |
| --- | --- |
| Complete / Undo / Delete Task | PASS |
| Home / Tasks / Chat / Shopping + bottom nav | PASS |
| Keyboard Shopping + tab bar hidden (M1) | PASS |

---

## Persistence verification

- `routines`: `M3rec…` → weekdays `[0..4]`, later `active=false`; task row still `open`.
- `tasks.checklist_id`: `M3cl…` → `fc9449c2-…`.
- `checklist_items` + `checklist_runs` / `checklist_run_items` (`occurrence_key=standalone`) for toggle/undo/delete.

---

## Known issues

- Same **7 baseline** unit test failures (unchanged from M0–M2), including HomeHeader `onAvatar`, product-clock frozen-date drift, local-android-notifications, memory selector, HOME fixture flags, turn_flags.
- Root Next `typecheck` validator noise in `.next/types` (unrelated).
- Day Plan / Planner / Home planning / Free Time / „מה שכחתי?” / Agent still deferred (M4+).
- Two bottom-nav implementations remain (M1 KEEP).

### Baseline failing tests (do not treat as M3 regressions)
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
- Deadline (`due_*`) ≠ Scheduled (`planned_*` / day_plan flexible).
- Soft delete = `status=cancelled` (not hard delete).
- Recurring: Task template stays open; occurrence state in `routine_occurrence_exceptions`.
- Checklist Template ≠ Run (`checklist_runs` + `occurrence_key`).
- Non-routine complete/reopen flips Task status without fabricating occurrence.
- M1 keyboard/safe-area/`adjustResize` behavior.
- Upload keystore v2 / Play SHA1 `9D:0C:…:B5:01`.

### DO NOT TOUCH until a later milestone allows
- Day Plan / „צור לי לו״ז” / Home planning / Free Time / „מה שכחתי?” / Agent.
- Production deploy / Play upload.
- Home V4 flower geometry redesign.
- Unrelated lockfile / Gradle churn.
- Global Checklists screen redesign (only shared open/return wiring was touched).

---

## Next milestone

**M4 — Day Plan Core / Single Source of Truth.** Do not start until explicitly approved.

---

## Next first action

1. Wait for human approval of M3.
2. On approval, read this handoff and the M4 brief before any code change.
3. First M4 action: inventory how Day Plan / `day_plan` / Home „צור לי לו״ז” currently diverge from Task `planned_*`, and define the single source of truth — no Free Time / What Did I Forget / Agent yet.

---

## Important architectural decisions

1. **Bottom safe area belongs to bottom chrome** (M1).
2. **Android:** Manifest `adjustResize` + keyboard inset / hide tab bar while IME open (M1).
3. **Task schedule SoT on row:** `planned_start_at` / `planned_end_at` when `plan_patch=set` (M2).
4. **Recurring SoT:** one active `routines` row per Task; occurrence via exceptions (M3).
5. **Checklist SoT:** template items on checklist; checked state on run (M3).
6. **No Push/Deploy** during the fix program unless requested.
7. **Handoff-before-commit** is mandatory.

---

## M2 / M1 / M0 archive (summary)

- M2 commit: `1fc2b5f…` — Task lifecycle, deadline≠schedule.
- M1 commit: `356c326…` — layout, keyboard, nav.
- M0: clean baseline; 7 failing tests pre-existing.
