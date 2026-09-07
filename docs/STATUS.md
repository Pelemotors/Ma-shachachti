# Delivery status

## Implemented

האפליקציה, מנוע הדומיין, קטלוג, סוכן עברית, SQL/RLS, תזכורות, PWA — וכן חבילת W13–W35:
AgentDecision V2, turnId, State V2 + 32 taxonomy, DailyPlanSession, Stable Replan, Task Editor פשוט, enrichment, Simple/Detailed, DurationWheel, Free Time V2, proposals table, ניווט Back, in_progress, time semantics, personalization/compaction/members/dedupe infra, Playwright smoke, agent-eval script.

## Validation

- Unit/DB tests כולל migration State V2.
- typecheck + build נדרשים בכל WP.
- E2E smoke דרך Playwright (CI).

## Manual acceptance שנותר

- Supabase Leaked Password Protection (Dashboard).
- Push פיזי: iPhone PWA + Android Chrome.
- Live OpenAI eval (`npm run agent:eval`) כאשר credentials זמינים.

פרטים: [ROADMAP-W13-W35.md](./ROADMAP-W13-W35.md)
