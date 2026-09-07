# ROADMAP W13–W35 — מה שכחתי?

## יושם בקוד

- **W13** AgentDecision V2: partial understanding, action isolation, strict schema path, policy partition.
- **W14** turnId על הודעות/צ'אט/receipts; retry עם אותו מפתח.
- **W15** State V2 + taxonomy של 32 קטגוריות + migrateState dual-read + מיפוי קטלוג.
- **W16** DailyPlanSession שמור ב־`planning.plan` + פעולות `plan.set/clear`.
- **W17** `replanDailyPlan` שומר locked/done/in_progress.
- **W18** Task Editor מינימלי (כותרת + דדליין + עוד פרטים).
- **W19** `lib/enrichment.ts` deterministic enrichment.
- **W20** תצוגת Simple כ־Category cards + drill-down.
- **W21** `DurationWheel`.
- **W22** Changed-day workflow עם overlay (cloud).
- **W23** `freeTimeV2` שתי קבוצות.
- **W24–W26** AgentProposal + `pending_proposals` API/migration + מדיניות shopping.
- **W27** `useAppNavigation` + `/` → `/app` + login `location.replace`.
- **W28** `in_progress` + `task.start`.
- **W29** `preferredWindow` + `task.deferUntil` + `lib/relative-time.ts`.
- **W30–W33** personalization/compaction/members/semantic dedupe infrastructure.
- **W34** Playwright smoke + agent-eval script + CI lint/typecheck/test/build/e2e.
- **W35** מסמך זה + עדכוני STATUS/ARCHITECTURE/PRODUCT.

## Migrations

- `database/migrations/20260907_state_v2_pending_proposals.sql` — schemaVersion 1|2 + `pending_proposals`.

## Breaking / compatibility

- AppState הציבורי הוא schemaVersion **2**.
- קריאה של V1 עוברת `migrateState` בלי לאבד IDs/היסטוריה.
- תוויות קטגוריה עברית אינן Source of Truth; משתמשים ב־`categoryId`.

## Manual acceptance שנותר

1. Supabase Auth Leaked Password Protection (Dashboard).
2. Physical Push QA: iPhone installed PWA + Android Chrome.

## Known limitations

- Live OpenAI eval אינו חלק מכל PR (עלות/יציבות).
- Changed-day ב־local demo אינו קורא ל־AI.
- Extraction של `home-app.tsx`: DurationWheel, nav, editor, ShoppingView (+ Plan*/FreeTime helpers ב־`plan-views.tsx`); Plan/Free עדיין מרונדרים גם inline.
- Playwright מכסה smoke בסיסי; תרחישי acceptance מלאים דורשים סביבת staging עם auth.
