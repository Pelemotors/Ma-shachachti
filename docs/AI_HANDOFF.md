# AI Handoff — מה שכחתי?

מקור אמת להמשך עבודה של AI/Developer.  
כל Milestone חייב לעדכן קובץ זה **לפני commit**. אין Milestone שנחשב DONE בלעדיו.

---

## Current state

- **Branch:** `main`
- **HEAD (pre-M1 commit):** `83b05e335d649bfeccf9dc5831a90b6cba5f5bdf` — after M1 commit this file will match the new SHA
- **Last completed milestone:** **M1 — Mobile Shell / Layout Infrastructure**
- **Last Play AAB:** versionCode **4** · versionName `0.1.0` · upload-key-v2  
  SHA1 `9D:0C:24:DE:FA:A6:B6:7B:F1:C4:07:6B:95:25:77:44:D1:AD:B5:01`
- **Local mobile `.env`:** LAN Next for emulator (gitignored)
- **Stop gate:** Do **not** start M2 until human approval

---

## Last completed milestone

### M0 — Baseline
Documented below (kept for history). Clean git at start; 438/445 tests pass; 7 pre-existing fails; Android smoke Home/Tasks/Chat/Shopping/nav PASS with known keyboard/safe-area layout debt.

### M1 — Mobile Shell / Layout Infrastructure ✅

**Scope:** shared layout only — Safe Area, Bottom Nav, Keyboard avoidance, scroll end clearance, RTL-preserving chrome, ChecklistRow a11y. No Tasks/Day Plan/Planner/Agent business logic. No redesign.

---

## Changes made

### M1 files
| Path | Change |
| --- | --- |
| `apps/mobile/src/layout/keyboard.ts` | Shared `useKeyboardHeight` / `useKeyboardOpen` / tab scroll metrics (+ emulator IME height fallback) |
| `apps/mobile/src/components/ui/AppScreen.tsx` | Bottom safe-area **off by default**; iOS-only KAV; Android footer lift via keyboard inset |
| `apps/mobile/src/components/ui/TabShell.tsx` | Shared Tasks/Shopping shell; **hides tab bar while keyboard open** |
| `apps/mobile/src/components/ui/ChecklistRow.tsx` | `accessibilityRole="checkbox"` + checked state |
| `apps/mobile/src/components/ui/index.ts` | Export `TabShell` |
| `apps/mobile/src/navigation/ProductShell.tsx` | Tasks/Shopping use `TabShell` |
| `apps/mobile/src/screens/home-v4/HomeV4Screen.tsx` | Lift absolute composer/bank with keyboard; hide bottom nav while open; more scroll end pad |
| `apps/mobile/src/screens/chat-v4/ChatV4Screen.tsx` | Same keyboard/nav pattern; drop Android `behavior="height"` fight with `adjustResize` |
| `apps/mobile/src/screens/TasksScreen.tsx` | `paddingBottom` 32→48 for scroll-end comfort only |
| `docs/AI_HANDOFF.md` | Created + updated (this file) |

### M0
- No product code; handoff created; local `.env` host aligned for smoke only.

---

## Verification performed

| Check | Result |
| --- | --- |
| `apps/mobile` `npm run typecheck` | **PASS** |
| `npm test` (root) | **438 pass / 7 fail** — same baseline failures, no new fails |
| Android Emulator M1 checklist | **PASS** (see below) |

---

## Android Emulator verification

**AVD:** `Pixel_8_Pro` · **device:** `emulator-5554` · portrait only.

| Check | Result |
| --- | --- |
| Open app / session | PASS |
| Home / Tasks / Chat / Shopping | PASS |
| All bottom tabs | PASS |
| Keyboard open — Shopping | PASS — input lifted (~711px), tab bar hidden |
| Keyboard open — Home | PASS — composer lifted (~740px), tab bar hidden |
| Keyboard open — Chat | PASS — composer lifted (~687px), tab bar hidden |
| Keyboard dismiss + nav restore | PASS |
| Scroll Tasks to end | PASS — nav remains usable |
| Long content (Tasks list) / short (empty areas) | PASS enough for M1 |
| Hardware back from Checklists overlay → Home | PASS |
| Rotation | Skipped — app is portrait-locked |

---

## Known issues

- Same 7 pre-existing unit test failures as M0 (including HomeHeader `onAvatar` expectation).
- Root Next `typecheck` validator noise in `.next/types` (unrelated).
- Tasks Pack icons / Home `TodayTaskRow` checkbox visuals remain product-specific (intentional; only `ChecklistRow` unified for a11y).
- Two bottom-nav implementations remain (`BottomNavBar` vs `HomeBottomNavigation`) with shared keyboard hide behavior.

---

## KEEP / DO NOT TOUCH

### KEEP
- Canonical product rules (Task↔Routine, occurrence_key, deadline ≠ schedule, day_plan entry rules, checklist Template≠Run).
- Upload keystore v2 / Play SHA1 `9D:0C:…:B5:01`.
- Home V4 / Chat V4 visual language.
- ProductShell overlay navigation model.
- `windowSoftInputMode=adjustResize` + Android keyboard lift via inset (do not reintroduce `behavior="height"` on Android).

### DO NOT TOUCH until a later milestone allows
- Tasks / routines / checklist-runs domain logic.
- Day Plan / Planner / Agent runtime.
- Production deploy / Play upload.
- Home V4 flower geometry redesign.
- Unrelated lockfile / Gradle churn.

---

## Next milestone

**M2 — awaiting human approval.** Do not start until explicitly approved.

Likely candidates (not started): Settings entry from Home, remaining baseline test debt, product surfaces beyond shell.

---

## Next first action

1. Wait for human approval of M1.
2. On approval, read this handoff and the M2 brief before any code change.

---

## Important architectural decisions

1. **Bottom safe area belongs to bottom chrome** (tab bar / screen footer), not to every `AppScreen` (`includeBottomSafeArea` opt-in only).
2. **Android:** Manifest `adjustResize` + keyboard height inset / hide tab bar while IME open. Avoid `KeyboardAvoidingView behavior="height"` on Android.
3. **IME height fallback (320)** when emulator reports show with empty metrics — keeps lift deterministic on Pixel AVD.
4. **Shared checkbox control for list rows:** `ChecklistRow`. Tasks Pack / Home V4 rows stay until a dedicated UI milestone.
5. **No Push/Deploy** during the fix program unless requested.
6. **Handoff-before-commit** is mandatory.

---

## M0 baseline archive (summary)

- HEAD at M0: `83b05e335d649bfeccf9dc5831a90b6cba5f5bdf`, clean tree.
- Smoke PASS for main tabs; keyboard/safe-area issues recorded as M1 targets.
- 7 failing tests pre-existing.
