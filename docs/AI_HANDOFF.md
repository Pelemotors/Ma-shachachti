# AI Handoff — מה שכחתי?

מקור אמת להמשך עבודה של AI/Developer.  
כל Milestone חייב לעדכן קובץ זה **לפני commit**. אין Milestone שנחשב DONE בלעדיו.

---

## Current state

- **Branch:** `main`
- **HEAD (pre-M1.1):** `95b1a28c6bd6a1a994285a0f9a540cb11f810135` (M3) — after M1.1 commit this file matches the new SHA
- **Last completed milestone:** **M1.1 — Android System Insets Verification**
- **Last Play AAB:** versionCode **4** · versionName `0.1.0` · upload-key-v2  
  SHA1 `9D:0C:24:DE:FA:A6:B6:7B:F1:C4:07:6B:95:25:77:44:D1:AD:B5:01`
- **Local mobile `.env`:** LAN Next for emulator (gitignored)
- **Stop gate:** Do **not** start M4 until human approval

---

## Last completed milestone

### M1.1 — Android System Insets Verification ✅

**Scope:** Verify / fix Android system navigation inset handling at shared layout level. No Task/recurring/checklist business logic, Day Plan, Planner, Home data, or Agent changes.

### What was found

1. **Architecture (M1 KEEP):** `AppScreen` excludes bottom SafeArea by default; **bottom chrome owns the inset** (`BottomNavBar` / `HomeBottomNavigation` use `paddingBottom: Math.max(insets.bottom, …)`).
2. **Gap:** when the keyboard opens, tab chrome is **hidden** and nothing reserved the system inset → footers/composers could sit under the gesture/3-button bar.
3. **Gap:** overlay screens with `AppScreen` footers (Checklist detail, Plan/Forgot/FreeTime footers) did **not** own the bottom inset (no tab bar underneath).
4. **M3 Save padding** (`modal paddingBottom: 48` + `actions marginBottom: 28`) was a **local workaround** for the Task editor `Modal` (portaled outside tab chrome) lacking system inset — not legitimate design spacing.

**System inset on emulator:** gesture nav ≈ **72px**; 3-button ≈ **144px**.

### Changes

| Path | Change |
| --- | --- |
| `apps/mobile/src/layout/systemBottomInset.tsx` | `SystemBottomInset` + `useBottomChromePadding` |
| `apps/mobile/src/components/ui/TabShell.tsx` | Reserve system inset when keyboard hides tab bar |
| `apps/mobile/src/components/ui/AppScreen.tsx` | `footerOwnsBottomInset` (no double-pad with `includeBottomSafeArea`) |
| `apps/mobile/src/screens/home-v4/HomeV4Screen.tsx` | `SystemBottomInset` + composer clears inset when kb open |
| `apps/mobile/src/screens/chat-v4/ChatV4Screen.tsx` | `SystemBottomInset` when kb open |
| `apps/mobile/src/screens/ChecklistDetailScreen.tsx` (+ Forgot / FreeTimeResults / PlanComposer) | `footerOwnsBottomInset` |
| `apps/mobile/src/screens/TasksScreen.tsx` | Modal/menu use `useBottomChromePadding`; **removed M3 fixed 48/28 workaround** |
| `tests/android-system-insets-m11.test.ts` | Source-level invariants (3) |
| `docs/AI_HANDOFF.md` | This update |

### M3 padding verdict

- **Removed** the fixed modal `paddingBottom: 48` / `actions marginBottom: 28`.
- **Replaced** with shared `useBottomChromePadding(12)` = `insets.bottom + 12` design pad.
- List `paddingBottom: 48` on the Tasks scroll list **kept** (tab-clearance scroll end, not Save workaround).

---

## Verification performed

| Check | Result |
| --- | --- |
| `apps/mobile` `npm run typecheck` | **PASS** |
| `npm test` (root) | **448 pass / 7 fail** — same 7 baseline; +3 M1.1 tests; no new fails |
| Android Emulator gesture + 3-button | **PASS** |
| M1–M3 regression (tabs, Save, kb hide nav, Home/Chat/Shopping/Tasks) | **PASS** |

---

## Android Emulator verification

**AVD:** `Pixel_8_Pro` · `emulator-5554`

| Scenario | Gesture (inset 72) | 3-button (inset 144) |
| --- | --- | --- |
| Bottom nav labels clear of system bar | PASS (gap=72) | PASS (gap=144) |
| Task editor Save visible / tappable | PASS | PASS |
| Shopping footer above system bar | PASS | PASS |
| Keyboard open + app nav hidden | PASS | PASS |
| Checklist detail „הוספה” footer | PASS | PASS |
| Chat composer | PASS | PASS |
| Home / Tasks reachable | PASS | PASS |

---

## Known issues

- Same **7 baseline** unit test failures (unchanged from M0–M3).
- Root Next `typecheck` validator noise in `.next/types` (unrelated).
- Two bottom-nav implementations remain (M1 KEEP): `BottomNavBar` + `HomeBottomNavigation` — both pad `insets.bottom`; both now use `SystemBottomInset` when hidden for keyboard.
- Day Plan / Planner / Free Time / „מה שכחתי?” / Agent still deferred (M4+).

### Baseline failing tests (do not treat as M1.1 regressions)
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
- Bottom safe area owned by bottom chrome (tab bar or `footerOwnsBottomInset` footer / modal `useBottomChromePadding`).
- `AppScreen` default **excludes** bottom SafeArea edge (avoids double-pad above tab bar).
- Deadline ≠ Scheduled (M2); recurring template≠occurrence (M3); checklist Template≠Run (M3).
- Soft delete = `cancelled`.
- M1 keyboard/`adjustResize` / hide tab bar while IME open.
- Upload keystore v2 / Play SHA1 `9D:0C:…:B5:01`.

### DO NOT TOUCH until a later milestone allows
- Day Plan / „צור לי לו״ז” / Home planning / Free Time / „מה שכחתי?” / Agent.
- Production deploy / Play upload.
- Home V4 flower geometry redesign.
- Unrelated lockfile / Gradle churn.

---

## Next milestone

**M4 — Day Plan Core / Single Source of Truth.** Do not start until explicitly approved.

---

## Next first action

1. Wait for human approval of M1.1.
2. On approval, read this handoff and the M4 brief before any code change.
3. First M4 action: inventory how Day Plan / `day_plan` / Home „צור לי לו״ז” diverge from Task `planned_*`, and define the single source of truth — no Free Time / What Did I Forget / Agent yet.

---

## Important architectural decisions

1. **Bottom safe area belongs to bottom chrome** (M1 / M1.1).
2. **When tab chrome is hidden (keyboard), still reserve `SystemBottomInset`.**
3. **Overlay footers** set `footerOwnsBottomInset`; tab screens leave it false.
4. **Modals/sheets** use `useBottomChromePadding`, not one-off magic numbers.
5. **No Push/Deploy** during the fix program unless requested.
6. **Handoff-before-commit** is mandatory.

---

## Prior milestones (archive)

- **M3** `95b1a28…` — Recurring Tasks + Task Checklist.
- **M2** `1fc2b5f…` — Task lifecycle, deadline≠schedule.
- **M1** `356c326…` — layout, keyboard, nav.
- **M0** — baseline; 7 failing tests pre-existing.
