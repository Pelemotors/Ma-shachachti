# מה שכחתי?

A Hebrew-first personal household assistant. Next.js application prepared for a dedicated Vercel project and a dedicated Supabase project. This repository contains application code, not personal household data.

## Quick start

```sh
npm ci
npm run dev
```

Without environment variables the app opens a clearly labelled **device-local demonstration**. It supports task management, planning, shopping, editable memory, a starter catalogue and a limited rule-based conversation. It does not claim to run a real language model or deliver background notifications.

For the connected app, copy `.env.example` to `.env.local` and follow [deployment](docs/DEPLOYMENT.md). Never commit keys.

## What is implemented

- Mobile-first Hebrew RTL UI, text and voice composer, full conversation history, task-context conversations.
- Three shared-state engines: what matters, daily planning, time-and-energy opportunities.
- Tasks, ideas, deferral, steps, dependencies, recurrence with separate occurrences, history and undo.
- 123 contextual starter suggestions with accept/exclude/restore controls.
- Shopping, purchase history and conservative purchase-interval forecasts.
- Household onboarding, AI consent, editable memory with expiry, personal work-time medians and habit suggestions.
- Authenticated cloud state, database RLS, optimistic revision control and transactional reminder synchronization.
- OpenAI Responses adapter with validated structured actions; explicit confirmation for broad/destructive operations.
- Audio recording and server-side transcription; editable transcript before sending.
- Reminder queue, VAPID Web Push subscriptions, authenticated scheduler endpoint and a service worker.
- Export personal JSON backup and print/save-as-PDF for tasks, shopping and daily plan.
- Behavioral and SQL integration tests. SQL tests use local PGlite/PostgreSQL, not a live Supabase project.

## Commands

```sh
npm test
npm run typecheck
npm run build
```

## Read before launch

- [Deployment and connection checklist](docs/DEPLOYMENT.md)
- [Implemented scope and remaining acceptance gates](docs/STATUS.md)
- [Product decisions](docs/PRODUCT.he.md)
- [Architecture and security](docs/ARCHITECTURE.md)
- [Personal agent instructions](lib/agent/INSTRUCTIONS.he.md)
- [Agent evaluation scenarios](docs/AGENT-EVALS.he.md)

This version models **one private household per authenticated account**. It does not yet implement invitations or shared access between separate accounts. No payments, automated purchases, external calendar sync, native app, or external medical advice integrations are included.
