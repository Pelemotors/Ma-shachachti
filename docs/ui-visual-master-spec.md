# UI Visual Master Spec — מה שכחתי?

**Status:** Canonical source of truth for mobile visual language.  
**Created:** 2026-09-20  
**Method:** Visual audit of two local reference boards. No invented palette.

| File | Role |
| --- | --- |
| `test-results/ui-visual/references/board-6-master.png` | MASTER ABSOLUTE (6 phones + Tasks overlay) |
| `test-results/ui-visual/references/board-10-secondary.png` | SECONDARY (10 phones) |

---

## A. Design Priority Rules

1. **לוח 6 = MASTER.** Every screen, component, token, and layout rule that appears on Board 6 wins.
2. **לוח 10 = SECONDARY.** Used only to expand states, complementary screens, and missing detail.
3. **Conflict resolution**
   - Same element on both boards → Board 6.
   - Element only on Board 10 and not contradicted by Board 6 → adopt from Board 10.
   - Ambiguous measurement → document in this spec, do not invent a third language.
4. **No new design language.** If it cannot be derived from the boards, it is a gap, not a creative license.
5. **Product data stays real.** Empty / placeholder states when live data is missing. No hardcoded demo lists as the finished product.

### Conflicts already identified

| Topic | Board 6 | Board 10 | Ruling |
| --- | --- | --- | --- |
| Home hero petals | 3 satellites (צור לי לו״ז, יש לי זמן פנוי, צ׳קליסטים) + center מה שכחתי? | 4 satellites around the center | **3 + center** |
| Tasks | First-class screen + overlay filters (עם תאריך / ללא תאריך) | Not a full phone; only via bottom nav | **Board 6 Tasks layout** |
| Day schedule | Not a standalone phone | Full timed list + "שמור ללו״ז" | **Board 10 fills this complementary screen** |
| Chat / Shopping / Checklist detail / Success | Not on Board 6 | Full phones | **Board 10 complementary** |
| Status bar time | 10:00 | 9:41 | **Use real device time** — never fake a clock |
| Greeting name | "בוקר טוב, אירה." | Same | **Live first name**; fallback without a fake name |

---

## B. Screen Inventory

### Board 6 — master screens

| ID | Screen | Hebrew title | Notes |
| --- | --- | --- | --- |
| A1 | Home | בוקר טוב, {name}. | Hero cluster, עכשיו אצלך, next tasks, voice, composer, bottom nav |
| A2 | Tasks | משימות | Overlay/sheet: עם תאריך / ללא תאריך, category chips, rounded rows |
| A3 | What did I forget | מה שכחתי? | AI reminder list, add-reminder CTA |
| A4 | Create schedule | צור לי לו״ז | Duration pills, later/date, primary CTA |
| A5 | Free time | יש לי זמן פנוי | Duration pills + suggested tasks ≤ N minutes |
| A6 | Checklists grid | צ׳קליסטים | 2-col category tiles |

### Board 10 — complementary only

| ID | Screen | Hebrew title | Adopt? |
| --- | --- | --- | --- |
| B1 | Home | (same as A1) | No — A1 wins |
| B2 | Create schedule | (same as A4) | Detail only (pills, later) |
| B3 | Day schedule | הלו״ז שלך! | Yes — complementary after plan is created |
| B4 | What did I forget | (same as A3) | Detail only (row icons) |
| B5 | Free time | (same as A5) | Detail only (suggestion rows) |
| B6 | Chat | שיחה | Yes |
| B7 | Shopping | קניות | Yes |
| B8 | Checklists grid | (same as A6) | No — A6 wins |
| B9 | Checklist category | {category} + progress | Yes |
| B10 | Success | הלו״ז מוכן! | Yes |

### Bottom navigation (both boards, 4 tabs)

RTL start (right) → left:

1. בית (home) — selected = filled house, camel
2. שיחה (chat) — speech bubble
3. משימות (tasks) — checkbox / list
4. קניות (shopping) — cart

---

## C. Component Inventory

| Component | Where it appears | Notes |
| --- | --- | --- |
| AppScreen | All | Cream canvas + leaf décor + safe area |
| TopGreetingHeader | Home | Tiny tagline + large greeting |
| HeroPetalActions | Home | Soft circular petals around camel center |
| PrimaryActionButton | Plan, Forgot, Success, etc. | Full-width camel capsule |
| SecondaryPillButton | Duration / date / later | Soft beige fill, camel selected |
| RoundedCard | Lists, now-block | Very round, white/cream |
| ChecklistRow | Free time, checklist detail, schedule | Circle checkbox + label + optional leading icon |
| TaskRow | Home next-up, Tasks, Forgot | Time or icon + title |
| CategoryTile | Checklists grid | Icon + title, square-round |
| BottomNavBar | Home, Chat, Shopping, Tasks, Forgot, Free time | 4 tabs |
| EmptyState | Any list at 0 | Soft leaves + quiet copy |
| SuccessState | After save plan | Large check circle + title + back home |
| ProgressBlock | Home "עכשיו אצלך", checklist header | Thin camel track |
| VoiceBankButton | Home | Waveform + "הקלטה לבנק" |
| ChatComposer | Home + Chat | Pill field + mic |
| ScreenHeader | Inner screens | Back chevron (RTL) + title + optional icon |
| LeafDecor | All | Low-opacity botanical corners |
| FilterChips | Tasks | עם תאריך / ללא תאריך |
| CategoryChipRow | Tasks | בית/ניקיון, בריאות, … |

---

## D. Design Tokens

Sampled visually from Board 6 (MASTER). Values are the working token set; Visual QA may nudge ±2–4.

### Color

| Token | Hex | Use |
| --- | --- | --- |
| `bg` | `#F6F1EA` | Screen background |
| `bgSoft` | `#F3EDE4` | Petal / chip fill |
| `surface` | `#FFFDF9` | Cards, rows, fields |
| `sage` | `#E4E6D9` | Center-adjacent muted petal if needed |
| `text` | `#3A2F28` | Titles, primary copy |
| `textMuted` | `#9A8B7C` | Tagline, captions, inactive nav |
| `accent` | `#A67C52` | Primary CTA, selected, progress |
| `accentDeep` | `#8B6240` | Pressed / selected icon |
| `accentSoft` | `#D4B48A` | Progress fill light |
| `line` | `#E8DFD4` | Borders, checkbox rings, dividers |
| `disabled` | `#E6DDD2` | Disabled CTA |
| `disabledText` | `#B5A89A` | Disabled label |
| `dangerSoft` | `#F3E4DC` | Errors only — never aggressive red |
| `onAccent` | `#FFFDF9` | Text on camel buttons |

**Forbidden:** strong blue, strong green, aggressive red, neon, glass, glossy gradients.

### Typography

| Role | Size | Weight | Line |
| --- | --- | --- | --- |
| Greeting | 30 | 700 | 36 |
| Screen title | 26 | 700 | 32 |
| Section | 16 | 600 | 22 |
| Body | 15 | 400 | 22 |
| Caption | 12 | 400 | 16 |
| CTA | 16 | 600 | 20 |
| Nav | 11 | 500 | 14 |

Hebrew, `writingDirection: 'rtl'`, `textAlign: 'right'`. Clean, mature, unisex. No display / script fonts.

### Radius

| Token | Value |
| --- | --- |
| `pill` | 999 |
| `card` | 26 |
| `row` | 22 |
| `tile` | 22 |
| `field` | 28 |
| `progress` | 999 |

### Spacing

4-based: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`.  
Screens are airy. Default horizontal page padding: **24**. Vertical section gap: **20–28**.

### Elevation

Almost flat. Cards: hairline `line` or 0–2pt very soft brown shadow (`#3A2F28` @ 4–6% opacity), never Material grey.

### Icons

Stroke, 1.5–2pt, rounded caps, camel/taupe. No filled colorful brand icons. Size 20–22 in rows, 24–28 in tiles, 28–32 in hero petals.

### Dividers

Rare. Prefer whitespace. If needed: 1px `line`, inset 20.

---

## E. Repeated Layout Rules

1. Cream field, lots of breathing room.
2. Dark clean titles, muted taglines directly under them (RTL).
3. Camel capsule CTAs, usually bottom-pinned on inner screens.
4. Rows and cards extremely rounded — never 8px Android chips.
5. Soft botanical leaves in corners / margins, low opacity, never content.
6. Minimal 4-tab bottom nav on primary surfaces.
7. Full visual RTL: back chevron on the right, trailing actions on the left.
8. Touch targets ≥ 48dp. Primary CTA height ~52–56. List row ~56–64.
9. Home composition is **not** a vertical button stack. Hero cluster is the focal composition.

---

## F. Reference → Product mapping

| Reference | Product route / screen | Data source |
| --- | --- | --- |
| A1 Home | `home` | `getDayPlan`, `listTasks`, auth display name |
| A2 Tasks | `tasks` (tab) | `listTasks` (`due_on` / `due_at` for chips) |
| A3 What did I forget | `forgot` | Derived from open tasks without time / overdue — **see tech gaps** |
| A4 Create schedule | `plan` | Duration local UI → `replanDay` |
| A5 Free time | `freetime` | Duration local UI → open tasks + plan windows |
| A6 Checklists grid | `checklists` | `listChecklists` as tiles |
| B3 Day schedule | `schedule` | `getDayPlan` items |
| B6 Chat | `chat` (tab) | `loadChat` / `sendChat` |
| B7 Shopping | `shopping` (tab) | `listShopping` |
| B9 Checklist category | `checklist` | `listChecklists` + toggle/add item |
| B10 Success | `planSuccess` | After successful `replanDay` |

---

## G. Non-negotiables

1. Cream / camel / warm-brown palette only.
2. Soft large radii everywhere.
3. Airy spacing.
4. Hero flower/petal cluster on Home.
5. Decorative leaves present, quiet.
6. 4-tab bottom nav as specified.
7. Camel capsule CTAs.
8. Natural Hebrew RTL (no mirrored glyphs).
9. Board 6 composition for Home — not “same widgets, different order”.
10. Real data or honest empty states. No finished-product mock lists.

---

## H. Uncertainties (do not guess silently)

### H1. Exact leaf illustration
The boards use a specific watercolor-like botanical. We cannot extract a lossless vector from the PNG.  
**Options:** (1) recreate low-opacity leaf silhouettes in code; (2) crop/trace a PNG sprite from the board.  
**Recommend:** (1) for v1, matching color/opacity/placement; refine if the user supplies an asset.  
**Impact:** mood only, not IA.

### H2. “מה שכחתי?” item source
Board 6 subtitle reads as an AI reminder of things you forgot. There is no dedicated mobile endpoint.  
**Options:** (1) derive from undated / overdue open tasks; (2) empty + tech gap; (3) invent demo rows.  
**Recommend:** (1) + empty state, never (3).

### H3. Duration → planner API
Pills 15–120 exist in the UI. `replanDay` accepts only `date` + `task_ids`.  
**Recommend:** keep pills as real UI state; pass through later when API exists. Do not hide the pills.

### H4. Greeting first name
Boards use “אירה.” Auth currently exposes email only.  
**Recommend:** first token of email local-part, or omit the name (“בוקר טוב.”) if missing. Never hardcode “אירה” in product.

### H5. Home “עכשיו אצלך” 3/8
Looks like completed / planned items for today.  
**Recommend:** `done` tasks today + planned items as denominator when plan exists; empty progress when no plan.
