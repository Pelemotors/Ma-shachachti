# Delivery status

## Implemented

The application, shared domain engine, 123-item catalogue, Hebrew agent instructions, backend adapters, initial SQL installer, authorization policies, reminder dispatcher, deployment guide and mobile-first PWA shell are implemented in this repository. All manual device-local workflows work without credentials by design. The local chat is explicitly a small rule-based demonstration, not a real AI service.

## Validation performed

- TypeScript static check and production build passed on the initial release.
- 25 automated tests cover domain rules and PostgreSQL-compatible execution in PGlite, including cross-user RLS, optimistic revision conflicts, reminder synchronization and protected quotas.
- Supabase project `rvhmbxkjftrqwaocwrdo` is now connected and the initial schema was installed as migration `20260906185427_initial_household_schema`.
- Live Supabase now contains `app_states`, `push_subscriptions`, `reminder_queue` and `ai_budgets`; RLS is enabled on all four tables. `ai_budgets` deliberately has no client policy and is service-role only.
- Mobile PWA metadata includes standalone mode, Apple web-app support, RTL Hebrew, touch-sized controls, safe-area-aware bottom navigation/composer, and `viewport-fit=cover` for iPhone/Android edge-to-edge layouts.

## Still requires live acceptance

- Real email OTP delivery and two-account authorization against hosted Supabase.
- Vercel runtime environment values for the dedicated Supabase project and server-only secrets.
- OpenAI key/model and real Hebrew conversational evaluation against `docs/AGENT-EVALS.he.md`.
- Real transcription on Safari/iPhone and Chrome/Android.
- VAPID keys, scheduler registration and real device Push delivery on both platforms.
- Hosted visual/interaction QA on representative iPhone and Android devices, including installed PWA mode, keyboard/composer behavior and safe areas.

## Product boundaries

The initial version supports a private household per account, not multiple accounts sharing one household. Calendar plans are relative work windows, not a full appointment calendar. Seasonality is a small set of explicit calendar suggestions, not a proven personalized seasonal learner. Long-term memory retrieval, sophisticated free-text scheduling constraints, and statistical personalization need real user evaluation. The temporary typographic app symbol is not an approved final logo.

Connecting credentials is necessary, but successful live integration tests remain a launch requirement. No percentage-complete or production-ready claim is made based on code volume alone.
