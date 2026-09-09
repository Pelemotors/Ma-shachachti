# Dedicated project setup

Target repository: Pelemotors/Ma-shachachti. Production (`https://ma-shachachti.vercel.app`) uses Supabase project `Ma-shachachti` at `https://mrggiqhxngoibhurinlk.supabase.co` (`NEXT_PUBLIC_SUPABASE_URL` in the Production bundle). That is the canonical database. The older identifier `rvhmbxkjftrqwaocwrdo` is not Production.

## 1. Database

1. Obtain access to the dedicated Supabase project through its owning account/organization.
2. Inspect existing tables first. `database/schema.sql` is an initial installer and is not safe to blindly rerun against an existing installation.
3. Run `database/schema.sql` in the dedicated project's SQL editor. It creates app_states, reminder_queue, push_subscriptions and ai_budgets, RLS policies, and three RPC functions.
4. Enable Data API exposure for public if necessary; grants and RLS are included in the installer.
5. Use two test accounts to verify one cannot read the other's data before inviting real users.

## 2. Auth

Enable email authentication. The UI uses email OTP codes, not a callback route. Configure the Magic Link email template to include `{{ .Token }}` (for example: `Your sign-in code is {{ .Token }}`). Set the correct Site URL and production redirect allowlist in Supabase. Configure email delivery for real pilot volume; built-in provider limitations are account-dependent.

## 3. Environment

Copy `.env.example` locally. In Vercel create a NEW project importing this repository; framework Next.js, root directory repository root, install `npm ci`, build `npm run build`.

| Variable                             | Where to obtain                                                | Browser visible? |
| ------------------------------------ | -------------------------------------------------------------- | ---------------- |
| NEXT_PUBLIC_SUPABASE_URL             | Dedicated Supabase project URL                                 | Yes              |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Supabase API settings                                          | Yes              |
| SUPABASE_SERVICE_ROLE_KEY            | Dedicated project secret/service-role key, server only         | No               |
| OPENAI_API_KEY                       | New dedicated OpenAI project                                   | No               |
| OPENAI_MODEL                         | A model available to that key supporting Responses JSON schema | No               |
| OPENAI_TRANSCRIPTION_MODEL           | A transcription model available to that key                    | No               |
| AI_HOURLY_LIMIT                      | Starts at 30                                                   | No               |
| NEXT_PUBLIC_VAPID_PUBLIC_KEY         | `node scripts/generate-push-keys.mjs`                          | Yes              |
| VAPID_PRIVATE_KEY                    | Same generation; save once and keep stable                     | No               |
| VAPID_SUBJECT                        | A real mailto contact URI                                      | No               |
| CRON_SECRET                          | Random long secret from your secret manager                    | No               |

Public environment changes require rebuilding. Never put secrets into chat, GitHub source, NEXT_PUBLIC variables, or screenshots. The installer and tests require no real API key.

## 4. Scheduler and Push

Run a scheduler every minute against `/api/cron/reminders`, with `Authorization: Bearer <CRON_SECRET>`. `docs/vercel-cron.example.json` contains the Vercel configuration; enable only when your hosting plan supports the cadence. Alternatively use an authorized external scheduler. No scheduler was registered during the build.

Open the app over HTTPS, sign in and enable notifications from Settings. On iPhone the installed home-screen app may be required. Confirm platform behavior on the actual device. If Push is unavailable the app explicitly says reminders are in-app only. Quiet hours delay notifications; equal start/end disables quiet hours.

## 5. Acceptance check after connection

- Sign in with two separate email accounts; create a task and verify isolation.
- Refresh/reopen and verify cloud data, not local demo state.
- Write one message with a task, idea and temporary fact; confirm only intended changes.
- Correct an action and undo one action; inspect all views for consistency.
- Open a task conversation and use a pronoun; check exact task targeting.
- Record Hebrew audio, inspect transcript, edit and send.
- Enable Push, set a reminder outside quiet hours, close the app and verify arrival.
- Cancel a reminder and confirm it does not deliver later.
- Test a disconnected provider or invalid key; the app must show failure without claiming saved/sent.
- Test simultaneous writes from two tabs; stale revisions must be rejected, not overwrite silently.

## Live status

Source and local validation are independent of hosting. No deploy is claimed by a successful Git push. Follow docs/STATUS.md for the exact validation performed in this delivery.
