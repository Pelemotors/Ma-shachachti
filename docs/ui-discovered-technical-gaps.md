# UI-discovered technical gaps

UI from the boards is the source of truth. Gaps below must not shrink the UI.

| Screen | Expected from reference | Current capability | Missing technology | Recommended implementation | Severity | Blocking? |
| --- | --- | --- | --- | --- | --- | --- |
| Gate / Auth | Signed-in Home | `EXPO_PUBLIC_SUPABASE_ANON_KEY` empty → session bootstrap throws | Anon key in local `.env` | Plant key; until then allow empty-shell viewing so Visual QA can proceed | Critical | Blocking for real login |
| Home greeting | “בוקר טוב, {שם}.” | `displayName` from user_metadata; email local-part is rejected | Production user has no given name | Keep fallback “ערב טוב.” — do not invent אירה | Minor | Non-blocking |
| Home “עכשיו אצלך” | N of M completed | `getDayPlan` + tasks exist; no dedicated progress API | Aggregation helper | Client-side from plan items + task status | Minor | Non-blocking |
| מה שכחתי? | AI list of forgotten items | No `/api/forgot` | Reminder / AI forget endpoint | Derive from open undated/overdue tasks; empty if none | Major | Non-blocking for UI |
| צור לי לו״ז | Duration + later date then generate | `replanDay(date, taskIds)` only | Duration / window preferences | Keep pills in UI state; call existing replan | Major | Non-blocking for UI |
| יש לי זמן פנוי | Duration filter + tasks that fit | Free windows computed locally; no duration filter API | Fit-by-duration on server | Filter open tasks client-side by heuristic 30m default | Major | Non-blocking |
| צ׳קליסטים grid | Template categories (מטבח, טיסה, …) | Generic user checklists | Template catalog | Render real lists as tiles; empty branded state if zero | Major | Non-blocking |
| Day schedule save | “שמור ללו״ז” | `replanDay` already persists `day_plan` | Separate save-vs-preview | Treat successful replan as saved; show Success | Minor | Non-blocking |
| Voice on Home | One-tap bank recording | Bank screen has recorder + upload | Home-level compact recorder | Wire Home CTA to existing bank/recording APIs | Major | Non-blocking for look |
| Chat composer on Home | Send from Home | `sendChat` exists | Home composer wiring | Same API as Chat tab | Minor | Non-blocking |
| Tasks filters | עם תאריך / ללא תאריך + categories | `due_on` / `due_at` exist; no category field | Task category taxonomy | Date chips from due fields; categories empty/disabled until field exists | Major | Non-blocking |
| RTL | Natural Hebrew | `I18nManager.forceRTL(true)` mirrored glyphs on EN emulator | Locale / writingDirection | Stop native forceRTL; style-level RTL | Critical | Blocking for visual truth |
| Household / Calendar / Privacy | Not on boards | Extra foundation screens | — | Keep reachable from overflow, not bottom nav | Minor | Non-blocking |
