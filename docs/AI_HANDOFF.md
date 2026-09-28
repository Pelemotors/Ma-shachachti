# AI Handoff — מה שכחתי?

מקור אמת להמשך עבודה של AI/Developer.  
כל Milestone חייב לעדכן קובץ זה **לפני commit**. אין Milestone שנחשב DONE בלעדיו.

---

## Current state

- **Branch:** `main`
- **HEAD (pre-M2):** `356c326b62d7e2974c5a1cc6ffd471eda4be95ad` (M1) — after M2 commit this file matches the new SHA
- **Last completed milestone:** **M2 — Task Domain**
- **Last Play AAB:** versionCode **4** · versionName `0.1.0` · upload-key-v2  
  SHA1 `9D:0C:24:DE:FA:A6:B6:7B:F1:C4:07:6B:95:25:77:44:D1:AD:B5:01`
- **Local mobile `.env`:** LAN Next for emulator (gitignored)
- **Stop gate:** Do **not** start M3 until human approval

---

## Last completed milestone

### M2 — Task Domain ✅

**Scope:** reliable Task lifecycle only — Create / Read / Update, Deadline vs Scheduled/execution time, Complete, Undo Complete, Delete, persistence after reload/restart. No recurring, Task Checklist, Day Plan UI, Planner, Home planning, Free Time, „מה שכחתי?”, Agent, or Tasks redesign.

### Root cause

1. **`plan_patch=set` did not persist schedule on the Task row** — `planned_start_at` / `planned_end_at` stayed null; schedule lived only in `day_plan` (legacy contract). Task was not a single reliable entity for scheduled time.
2. **Mobile Tasks UI mixed open + done** and lacked a clear „בוצעו” section / weak complete error handling.
3. **Deadline edit could strip `due_at` clock** when only the date was re-saved.
4. Soft-delete (`cancelled`) and non-routine complete/reopen were already mostly sound on the server; the gap was schedule persistence + UI lifecycle clarity.

**Invariant enforced:** `due_on` / `due_at` = Deadline; `planned_start_at` / `planned_end_at` (+ day_plan mirror) = Scheduled/execution. A task without deadline is not auto-today.

---

## Changes made

### M2 files
| Path | Change |
| --- | --- |
| `lib/actions.ts` | `task.create` / `task.update` with `plan_patch` write `planned_*` on Task; clear day_plan by prior planned date (not due); `saveTaskPlans` writes `planned_*` for flexible items |
| `apps/mobile/src/api/tasks.ts` | `createTask` accepts planned date/time separately from due |
| `apps/mobile/src/api/planning.ts` | `jerusalemDateTimeParts` for editor round-trip |
| `apps/mobile/src/screens/TasksScreen.tsx` | open vs „בוצעו”; deadline vs שיבוץ fields; preserve due clock; complete/reopen errors; labels |
| `tests/task-lifecycle-m2.test.ts` | M2 lifecycle unit tests (4) |
| `tests/schedule-semantics.test.ts` | Expect `planned_*` when schedule is set; due stays null for planned-only |
| `docs/AI_HANDOFF.md` | This update |

### Prior milestones (archive)
- **M1** — layout / keyboard / nav (commit `356c326…`)
- **M0** — baseline + 7 known test failures

---

## Verification performed

| Check | Result |
| --- | --- |
| `apps/mobile` `npm run typecheck` | **PASS** |
| `npm test` (root) | **442 pass / 7 fail** — same 7 baseline failures; +4 M2 tests pass; no new fails |
| Android Emulator M2 Task checklist | **PASS** (see below) |
| Persistence vs Supabase `tasks` | **PASS** — create/update/complete/reopen/delete verified by service-role reads |
| M1 regression (tabs + keyboard lift/nav hide) | **PASS** |

---

## Android Emulator verification

**AVD:** `Pixel_8_Pro` · **device:** `emulator-5554` · portrait · API via LAN Next `:3000`.

| Scenario | Result |
| --- | --- |
| Create without Deadline → UI + DB | PASS (`due_*` null, status open) |
| Reload / app restart — still present | PASS |
| Create with Deadline → DB keeps `due_on` | PASS |
| Restart — deadline persists | PASS |
| Edit: set Scheduled time — `planned_*` set, `due_on` unchanged | PASS |
| Edit notes — persistence; plan+deadline kept | PASS |
| Complete → UI „בוצעו” + DB `status=done` | PASS |
| Restart — still Completed | PASS |
| Undo Complete → same id, open; deadline/notes/plan kept | PASS |
| Delete → UI gone; DB `cancelled`; restart does not restore | PASS |
| Home / Tasks / Chat / Shopping + bottom nav | PASS |
| Keyboard Shopping + tab bar hidden (M1) | PASS |

---

## Known issues

- Same **7 baseline** unit test failures (unchanged from M0/M1), including HomeHeader `onAvatar`, product-clock frozen-date drift, local-android-notifications, memory selector, HOME fixture flags, turn_flags.
- Root Next `typecheck` validator noise in `.next/types` (unrelated).
- Recurring / Task Checklist / Day Plan planner UX still deferred (M3+).
- Two bottom-nav implementations remain (M1 KEEP).

### Baseline failing tests (do not treat as M2 regressions)
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
- Non-routine complete/reopen flips Task status without fabricating occurrence.
- Canonical product rules (Task↔Routine, occurrence_key, checklist Template≠Run).
- M1 keyboard/safe-area/`adjustResize` behavior.
- Upload keystore v2 / Play SHA1 `9D:0C:…:B5:01`.

### DO NOT TOUCH until a later milestone allows
- Recurring tasks / routine series UX (M3).
- Task Checklist binding flows (M3).
- Day Plan / „צור לי לו״ז” / Home planning / Free Time / „מה שכחתי?” / Agent.
- Production deploy / Play upload.
- Home V4 flower geometry redesign.
- Unrelated lockfile / Gradle churn.

---

## Next milestone

**M3 — Recurring Tasks + Task Checklist.** Do not start until explicitly approved.

---

## Next first action

1. Wait for human approval of M2.
2. On approval, read this handoff and the M3 brief before any code change.
3. First M3 action: inventory how routines + checklist_id attach to Task today (mobile + `lib/actions` + schema) and fix lifecycle gaps only — no Day Plan/Agent.

---

## Important architectural decisions

1. **Bottom safe area belongs to bottom chrome** (M1).
2. **Android:** Manifest `adjustResize` + keyboard inset / hide tab bar while IME open (M1).
3. **Task schedule SoT on row:** `planned_start_at` / `planned_end_at` must be written when `plan_patch=set` (and for flexible `saveTaskPlans`); day_plan remains the day-board mirror, not a substitute for Task fields.
4. **Fixed vs flexible in saveTaskPlans:** fixed → `due_*` only; flexible → `planned_*` only (deadline ≠ schedule).
5. **No Push/Deploy** during the fix program unless requested.
6. **Handoff-before-commit** is mandatory.

---

## M1 / M0 archive (summary)

- M1 commit: `356c326…` — layout, keyboard, nav.
- M0: clean baseline; 7 failing tests pre-existing; smoke tabs PASS with layout debt → M1.
