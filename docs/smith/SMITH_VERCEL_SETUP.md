# Smith Vercel Preview Setup

Status: **DISCONNECTED**

`lib/smith/preview.ts` defines the provider contract. The current implementation
is deliberately disconnected and cannot deploy.

## Required flow

1. Smith work-item branch is pushed.
2. Vercel creates a Preview deployment.
3. The adapter verifies the provider deployment's exact commit SHA.
4. URL and deployment ID are persisted to `smith_previews`.
5. Tests run against that URL.
6. Screenshots and test evidence are linked to the same SHA.

## Preview variables

Allowed:

- Supabase URL
- publishable key
- Test user identity/session provisioned by the test runner
- non-sensitive Preview configuration

Forbidden:

- Supabase service-role or secret key
- Production database credentials
- Production cron secrets
- Production push secrets
- Production executor credentials
- Production deployment credential available to Smith

Preview must default to the test data route, but `db.schema` is not treated as
a security boundary.

## Activation prerequisites

- hosted `smith_test` isolation matrix passed
- GitHub App and protected branches verified
- Vercel project connection reviewed
- Preview environment-variable scopes audited
- deployment webhook/status source tied to exact SHA
- private artifact storage available
- Playwright test user and runner available

Until all prerequisites are true, the Admin UI must show
`Preview Provider עדיין לא הוגדר` and no Preview URL.
