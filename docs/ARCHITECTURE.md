# Architecture

## Layered application structure

```text
React Views
    ↓
Controllers (hooks/)
    ↓
Domain Services (lib/domain/)
    ↓
Action Reducer (applyActions)
    ↓
AppState V2 (lib/model/)
    ↓
Repository (lib/persistence/)
    ↓
Supabase / localStorage
```

```text
Chat API
↓
Agent Orchestrator (lib/agent/orchestration.ts)
↓
AgentDecision
↓
Policy partition
↓
Actions / Proposals
↓
Client commit → AppState
```

UI and views must not call `migrateState`, Supabase clients, or OpenAI directly.
Controllers own turnId / idempotency / proposal session storage.
Domain modules are pure (no React, no fetch, no Supabase).

## Data path

UI → action schema → deterministic domain reducer → persistence adapter → shared AppState.

Local mode stores one versioned schema in this browser and rejects conflicting writes. Cloud mode validates JWT with Supabase getUser, uses the user's token for RLS, reads current revision, and invokes save_app_state in one database transaction. The owner id is derived from auth.uid(), never from model output or request body.

`useHousehold` remains the client persistence orchestrator (load / commit / undo / modes). `lib/persistence` exposes a thin `StateRepository` interface (`LocalStateRepository` / `CloudStateRepository`) for clarification and future adapters — it is not a mandatory rewrite of the hook.

The first release deliberately stores a bounded state document per account. This simplifies atomic multi-object actions and undo. Queue/subscription/quota rows are separate. A max 2 MB database constraint and bounded Zod arrays limit growth. This is a pilot architecture, not a claim of indefinite history or many-user collaborative editing.

Migration boundary: raw DB JSON → `migrateState()` → State V2 only. Business code never branches on schemaVersion 1.

## AI

`/api/chat` authorizes, checks idempotency receipts, budgets, then calls `orchestrateChatTurn`. Orchestration loads consent and state context, calls the OpenAI Responses API with `store:false`, parses AgentDecision with per-action isolation, dry-runs actions, and partitions policy. The Hebrew instruction file is the source of behavior. The model cannot change consent, profile, history or exclusions.

The client applies permitted small actions according to the user's auto-apply preference. Broad/destructive actions and AI-invented proposals appear for confirmation. The reply never serves as proof of persistence; the application displays a success notice after the actual save. turnId ties user message, AI response, actions and retries.

No provider key is exposed. Rate budgets are database-backed and callable only by the server service role. If budget configuration is absent, paid AI calls fail closed. Quota is per hour and counts failed provider calls to bound abuse.

## Module map

| Layer           | Location                    |
| --------------- | --------------------------- |
| Views           | `components/views/*`        |
| Controllers     | `hooks/use-*-controller.ts` |
| Domain          | `lib/domain/*`              |
| Model / migrate | `lib/model/*`               |
| Server          | `lib/server/*`              |
| Persistence     | `lib/persistence/*`         |
| Contracts       | `lib/contracts/*`           |
| Agent           | `lib/agent/*`               |
| Errors          | `lib/errors/*`              |

## Audio

MediaRecorder captures at most 90 seconds, using a supported webm/mp4/ogg type. The route verifies auth, consent, type, size and budget, then forwards the audio to the transcription provider. No recording is uploaded to application storage. The transcript becomes an editable draft, never an automatically sent message.

## Reminders

save_app_state syncs reminder rows atomically. A trusted scheduler invokes /api/cron/reminders with a bearer secret. Rows are claimed with FOR UPDATE SKIP LOCKED and a three-minute lease. Quiet hours defer delivery. Web Push payloads contain generic text so private task titles are not exposed on the lock screen. Only allowlisted browser push providers can be contacted; invalid subscriptions are removed on 404/410.

Delivery is at-least-once best effort: a process crash between provider acceptance and database update can produce a duplicate. Browser notification tags reduce duplication. Marked sent means accepted by a push provider, not read by a human. A maximum of five attempts is made. If no usable subscription exists, the reminder remains in-app and can ultimately show failed delivery. Cron scheduling is an explicit deployment step, not enabled by a demo or a README claim.

## Authentication and privacy

Email OTP authentication uses a publishable key client-side; every server request checks the access token. Browser session tokens are managed by supabase-js. All private responses are uncached; the service worker never caches data. AppState, reminders and subscriptions are RLS-protected by account ownership. Quota tables have no client access. No SECURITY DEFINER functions are needed.

The application renders text as React text nodes and does not use dangerouslySetInnerHTML. It has no uploads of arbitrary HTML. JSON backups contain personal data and are deliberately user-initiated. Household demo state is never imported into a cloud account automatically.

## Verification boundaries

Unit tests validate decisions; PGlite tests exercise the actual SQL, roles, RLS, transactional revisions and queue changes. Live Supabase, real provider calls, mobile microphone and Web Push still require integration checks after credentials are installed. Typecheck/build passing is not evidence that those live connections work.

Primary implementation references: [Supabase authorization](https://supabase.com/docs/reference/javascript/auth-getuser), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Responses API](https://platform.openai.com/docs/api-reference/responses), [Web Push](https://github.com/web-push-libs/web-push).
