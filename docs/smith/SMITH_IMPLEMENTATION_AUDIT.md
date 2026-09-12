# Smith Implementation Audit

Verified against `feature/smith-control-center` at baseline
`39e5c8b3d52b3c2d0e15612fda2f807530961c79`.

## Workspace boundary

- Development workspace: `mashachachti-smith-clean`
- Lean reference and the old Smith worktree are not development targets.
- Smith is separate from the personal agent under `lib/agent`.
- The current build remains local-first; no Production mutation is part of this audit.

## Existing capabilities

| Capability                     | Status                         | Current implementation / evidence                                                                                                  |
| ------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Admin authentication           | Existing                       | `lib/server-auth.ts` exposes `authorizeAdmin`; every current Admin API calls it.                                                   |
| Account roles                  | Existing, externally dependent | `lib/account-access.ts` and `public.user_roles`; the complete original table/function migration is not present in this repository. |
| Admin UI                       | Existing, monolithic           | `app/admin/page.tsx` implements five client-side tabs in one component.                                                            |
| Admin APIs                     | Existing                       | Six routes under `app/api/admin`: users, tasks, overview, activity, AI and health.                                                 |
| Authenticated browser requests | Existing                       | `authFetch` in `lib/supabase-browser.ts`.                                                                                          |
| Operational activity           | Partial                        | `lib/activity.ts` writes to `activity_events`; schema creation is not represented in the checked-in migrations.                    |
| Health and aggregate metrics   | Partial                        | Current Admin APIs derive limited health, task and AI aggregates. They are not a Smith observation system.                         |
| Personal agent                 | Existing and protected         | `lib/agent/**`, `/api/chat` and the 229-test baseline. Smith must not reuse its prompt or change its semantics.                    |
| Cron                           | Existing                       | Reminder and recording cleanup routes configured by `vercel.json`.                                                                 |
| Push notifications             | Existing for user reminders    | VAPID helpers, service worker and reminder dispatch; no Smith notification layer.                                                  |
| Storage                        | Existing for recordings        | Private `recordings` bucket policies in `database/migrations/20260912_voice_recording_bank.sql`.                                   |
| Realtime                       | Missing                        | No application `postgres_changes` subscription or Smith publication configuration.                                                 |
| Durable Smith jobs             | Missing                        | Existing cron routes are not a leased, retryable Smith job queue.                                                                  |
| Work items / observations      | Missing                        | No Smith control-plane schema or API.                                                                                              |
| Preview provider               | Missing                        | Vercel cron configuration exists, but no Preview deployment abstraction or persisted Preview evidence.                             |
| Browser tests                  | Missing                        | Playwright is not a direct dependency and no E2E configuration exists.                                                             |
| GitHub automation              | Missing                        | No Smith GitHub App, webhook, runner, PR policy or CODEOWNERS.                                                                     |
| Production approval gate       | Missing                        | No external re-auth, SHA-locked authorization or separate executor.                                                                |
| CI                             | Partial draft                  | `.github/workflows/ci.yml` is a Phase 0 draft. It must pass without reformatting the legacy baseline.                              |

## Reuse candidates

- `authorizeAdmin` and the error pattern in `lib/server-auth.ts`
- `authFetch` and the browser auth listener in `lib/supabase-browser.ts`
- `createServiceClient` for existing trusted Admin/Cron routes only; it must never enter Preview runtime
- `recordActivity` as the starting point for an event envelope, after redaction and schema ownership are defined
- Existing Admin loading, denied and empty-state behavior
- Existing Heebo/RTL root layout
- Current task, AI and health aggregates where their semantics are explicit

## Database findings

- Checked-in SQL currently lives in `database/migrations`.
- Several objects used by the application predate the checked-in Lean migrations:
  `user_roles`, `activity_events`, `handle_new_user_role` and
  `admin_set_user_access`.
- No functions named `claim_chat_receipt` or `complete_chat_receipt` exist at
  HEAD. Turn idempotency is implemented with `agent_turns` and TypeScript
  helpers in `lib/agent/turn-receipts.ts`.
- `execute_lean_action_idempotent` is the relevant checked-in RPC. Existing
  grants and dependencies must be audited against an isolated database before
  any hardening migration.
- The repository has no Supabase CLI project configuration. New migrations
  must be created through the current CLI after inspecting `--help`; migration
  history must not be guessed or silently split.

## Security gaps and boundaries

- The current Admin page is client-gated, while its APIs are server-authorized.
  Smith routes require the same API protection and explicit page states.
- `activity_events` accepts operational metadata, but there is no central
  secret-redaction contract.
- The shared Auth system means a test identity could enter Production bootstrap
  paths unless `app_metadata.environment` is handled server-side.
- Selecting `db.schema = smith_test` is routing, not isolation.
- No current mechanism proves that a test JWT is denied from public tables,
  RPCs and Production Storage.
- No Smith identity, current user token or broad service credential may become
  a Production executor.

## Test and CI findings

- Baseline command: `npm test` using Node's test runner over
  `tests/*.test.ts`.
- Baseline count before Smith: 229 tests.
- `npm run typecheck` runs Next type generation and TypeScript.
- `npm run build` uses the Next webpack build.
- `lint` is only an alias for typecheck; ESLint is not installed.
- Most existing tests are unit or source-contract tests. There is no live
  Supabase security matrix and no browser E2E suite.
- The legacy repository is not globally Prettier-clean. CI formatting is
  intentionally scoped to Phase 0 infrastructure and Smith-owned files as
  those paths are added.

## Implementation consequences

1. Prove the `smith_test` role boundary in a local stack or isolated DB branch
   before expanding either test data or the control plane.
2. Stop for explicit approval before applying that POC to the shared Production
   Supabase project.
3. Build the Smith control plane and deterministic event/job machinery before
   presenting connected UI states.
4. Keep integrations disconnected until their identities, credentials and
   protections are verified.
5. Treat every Preview, test result, screenshot, manual QA decision and
   Production authorization as evidence for one exact 40-character SHA.
