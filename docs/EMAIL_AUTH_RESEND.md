# Email Auth — Resend + Self-hosted Supabase Auth

## How Auth works today

- App uses **Supabase Auth (GoTrue v2.196)** self-hosted on the VPS.
- Email signup is enabled (`GOTRUE_EXTERNAL_EMAIL_ENABLED=true`).
- Auto-confirm is **off** (`GOTRUE_MAILER_AUTOCONFIRM=false`) — verification is required.
- SMTP currently points at the **fake** in-stack mailer:
  - `SMTP_HOST=supabase-mail`
  - `SMTP_PORT=2500`
  - `SMTP_ADMIN_EMAIL=admin@example.com`
- App UI had signup / login / forgot-password stubs, but:
  - forgot-password redirected to `/app` (no reset screen)
  - no auth callback route
  - no confirm-password / resend verification UX
  - emails could not leave the fake SMTP sink

## What this branch adds (code only)

- `/auth/callback` — verification / magic link landing
- `/auth/reset-password` — choose new password after recovery link
- Login UX: confirm password, neutral forgot-password, resend verification
- Hebrew GoTrue email templates under `supabase-email-templates/`
- PKCE + `detectSessionInUrl` on the browser Supabase client

**No Production deploy / no Production Supabase restart / no secret planted in this task.**

## Exact SMTP env for Production Supabase Auth

File to edit on the VPS (Auth container source of truth):

`/srv/ira/ma-shachachti/supabase/.env`

Set (owner action — do **not** commit secrets):

```bash
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<RESEND_API_KEY>
SMTP_ADMIN_EMAIL=noreply@mashachachti.co.il
SMTP_SENDER_NAME=מה שכחתי?
```

Notes:
- `SMTP_PASS` must be the Resend API key (same value currently present as `RESEND_API_KEY` in `app/.env.production`, but Auth reads **`supabase/.env`**, not the Next app env).
- Keep `ENABLE_EMAIL_AUTOCONFIRM=false`.
- Keep `SITE_URL=https://mashachachti.co.il`.
- `ADDITIONAL_REDIRECT_URLS` already allows `https://mashachachti.co.il/**` (covers `/auth/callback` and `/auth/reset-password`). Optionally make them explicit:
  `https://mashachachti.co.il/auth/callback,https://mashachachti.co.il/auth/reset-password,https://mashachachti.co.il/**,https://www.mashachachti.co.il/**`

## Email templates (optional but recommended)

Mount templates into the Auth container, then set in `supabase/.env` / compose:

```bash
GOTRUE_MAILER_SUBJECTS_CONFIRMATION=אימות החשבון — מה שכחתי?
GOTRUE_MAILER_SUBJECTS_RECOVERY=איפוס סיסמה — מה שכחתי?
GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE=אימות כתובת מייל — מה שכחתי?
GOTRUE_MAILER_TEMPLATES_CONFIRMATION=file:///etc/auth/templates/confirmation.html
GOTRUE_MAILER_TEMPLATES_RECOVERY=file:///etc/auth/templates/recovery.html
GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE=file:///etc/auth/templates/email-change.html
```

Compose volume example (run from `/srv/ira/ma-shachachti/supabase`):

```yaml
services:
  auth:
    volumes:
      - ../app/supabase-email-templates:/etc/auth/templates:ro
```

Then set `GOTRUE_MAILER_TEMPLATES_*` as above and recreate the Auth service.

## OWNER_REQUIRED before Production mail works

1. **Resend domain / sender** — verify `mashachachti.co.il` (or the chosen domain) in Resend and use a verified sender such as `noreply@mashachachti.co.il`.
2. **Plant `SMTP_PASS=<RESEND_API_KEY>`** into `/srv/ira/ma-shachachti/supabase/.env` (not git).
3. **Restart Auth only** after env change: from `/srv/ira/ma-shachachti/supabase` → `docker compose up -d auth` (owner-controlled Production change).
4. **Deploy this app branch** so `/auth/*` routes exist in Production Next.

## QA

QA Supabase (`supabase-qa/.env`) still uses fake SMTP by default. UI/redirect flows can be tested without Resend; live send requires the same SMTP wiring against a QA Resend sender (optional).

Suggested QA SITE redirects already include `http://127.0.0.1:3011/**`.

## Activation checklist (Production — later)

1. Merge/deploy app with `/auth/callback` + `/auth/reset-password`
2. Verify Resend domain + sender
3. Update `supabase/.env` SMTP_* (and optional templates)
4. Restart `supabase-auth`
5. Smoke: signup → mail → verify → login; forgot → mail → reset → login
