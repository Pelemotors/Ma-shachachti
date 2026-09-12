# Smith Runbook

## Current safe state

- Phase 1A Local Security POC: Passed
- hosted `smith_test`: Not configured
- hosted `smith_control`: Not configured
- GitHub App: Disconnected
- Preview provider: Disconnected
- Playwright: Not configured
- Production gate: Disconnected
- Production executor: Disconnected
- Smith kill switch default: Active

## Local validation

```powershell
npm run format:check
npm test
npm run typecheck
npm run build
```

Database validation:

```powershell
docker context use default
.\node_modules\.bin\supabase.cmd start
.\node_modules\.bin\supabase.cmd db reset --local --no-seed
npm run smith:poc
.\node_modules\.bin\supabase.cmd db lint --local --schema public,smith_test,smith_control --level warning --fail-on error
.\node_modules\.bin\supabase.cmd db advisors --local --type security --level warn --fail-on error
.\node_modules\.bin\supabase.cmd stop
```

Inspect `--help` before every Supabase CLI command.

## Milestone release procedure

1. Confirm workspace and branch.
2. Inspect `git status` and `git diff --stat`.
3. Run all local gates.
4. Scan the complete outgoing diff for credentials and sensitive artifacts.
5. Create a small local commit.
6. Push only `feature/smith-control-center`.
7. Do not merge `main`.
8. Do not claim Preview or Production success without provider evidence.

## Kill switch

When active:

- no autonomous job may be enqueued
- no branch or push
- no Preview deploy
- no test-database write

Read-only observations and Admin visibility remain available.

## Incident handling

Stop immediately for:

- test JWT access to Production
- service-role credential in Preview
- stale evidence used for approval
- SHA mismatch
- webhook signature mismatch
- required test failure
- secret leakage
- Smith target of `main`
- missing branch protection before Git mutation
- any active self-approval or Production execution path

Record the failure without secrets, set the Work Item to `blocked` or `failed`,
and preserve evidence.

## Local stack lifecycle

The Supabase Local stack is disposable test infrastructure. It contains no
Production data. Stop it after verification. Do not use `--linked`, hosted
project refs or remote database URLs in local POC commands.

## Production boundary

Before the first hosted schema or Auth change, stop and obtain explicit approval
for `PHASE_1A_PRODUCTION_CHANGE_REVIEW.md`.

Before the first Production deployment or rollback, require the separately
reviewed Production Gate and Executor identities. Smith itself stops at
`READY_FOR_ADMIN`.
