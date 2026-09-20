# UI Visual Gap Report

**Updated:** 2026-09-20 after Phase 1–5 implementation.  
**Emulator pack:** `test-results/ui-visual/emulator/`  
**References:** `test-results/ui-visual/references/board-6-master.png`, `board-10-secondary.png`

## Capture status

The first post-implementation emulator loop did **not** produce a usable screenshot of the new UI. `emulator-5554` dropped offline repeatedly; after restore, `com.mashachachti.app` stayed on a black MainActivity while Metro reported an old/partial bundle. Those frames are saved as:

- `emulator/01-launch.png` — black
- `emulator/02-after-wait.png` — black
- `emulator/03-relaunch.png` — black

**No screen is marked DONE.** The table below is a spec-vs-code audit, not a pixel sign-off.

## Per-screen (code vs Board 6 / 10)

### Home (A1) — not signed off

| Check | Status | Severity |
| --- | --- | --- |
| Greeting + tagline | Implemented (`TopGreetingHeader`) | — pending capture |
| 3 petals + camel center | Implemented (`HeroPetalActions`) | Major until measured |
| עכשיו אצלך progress | Implemented | Major until measured |
| Next-task rows | Implemented from `day_plan` | Major |
| Voice + composer | Implemented | Major |
| Bottom nav 4 tabs | Implemented | Major |
| Leaf décor | Abstract ellipses, not traced botanicals | Major |
| Petal exact geometry | Approximate, not measured from PNG | Major |

### Tasks (A2) — not signed off

Date chips + circle rows exist. Category chip row from Board 6 is **missing** (no category field). Overlay-card-on-home treatment was implemented as a full tab.

### What did I forget (A3) — not signed off

List derived from undated/overdue tasks. Add-reminder CTA is **disabled** (no API). Subtitle is interpretive.

### Create schedule (A4) — not signed off

Duration pills + later chip + camel CTA. Pills do not yet change `replanDay` payload.

### Free time (A5) — not signed off

Composer + results list. Duration is UI state; fit-by-minutes is not server-backed.

### Checklists (A6 / B9) — not signed off

2-col tiles from live lists. Template catalog (מטבח/טיסה/…) only appears if real lists exist. Detail + progress implemented.

### Chat / Shopping / Schedule / Success (B3, B6, B7, B10) — not signed off

Shell language applied. Chat is quiet rows, not old bubbles. Success is branded check + “חזרה הביתה”.

## Remaining deltas

1. Emulator visual loop must be re-run until cream UI is actually captured.
2. Leaf assets need a traced PNG/SVG from the board (current décor is a stand-in).
3. Measure petal diameters, CTA height, row height, nav icon size against Board 6.
4. Confirm Hebrew is no longer glyph-mirrored (`forceRTL` removed; style-level RTL only).
5. Tasks category chips — blocked on data model.
6. Forgot “add reminder” — blocked on API.
7. Home greeting name — email local-part, never hardcoded “אירה”.

## Severity leftover

- **Critical:** no verified emulator screenshot of the new UI.
- **Major:** leaf fidelity, hero geometry, disabled/forget/duration tech gaps.
- **Minor:** greeting name source, save-vs-preview on schedule.
