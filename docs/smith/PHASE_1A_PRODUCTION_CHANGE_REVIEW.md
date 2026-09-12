# Phase 1A Production Change Review

Status: **REVIEW ONLY — NOT APPROVED FOR PRODUCTION**

This document describes the smallest hosted-project change required to repeat
the locally passed isolation proof. It does not authorize applying SQL,
enabling an Auth Hook, creating an Auth user or changing Storage.

## Source and migration boundary

The local POC migration is:

`supabase/migrations/20260912131459_smith_security_poc.sql`

It must **never be applied as-is to Production**. It contains deliberately
local representative objects:

- `public.smith_poc_production_records`
- `public.smith_poc_production_rpc`
- the `production-recordings` POC bucket and policy

After explicit approval, a new migration must be created with the then-current
CLI:

```powershell
.\node_modules\.bin\supabase.cmd migration new smith_test_security_boundary
```

The CLI-generated filename must be used. The hosted migration must contain only
the reviewed Production subset below.

## Exact hosted objects proposed

### PostgreSQL role

Create `smith_test` only if absent:

```sql
create role smith_test
  nologin
  noinherit
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication;
```

Required membership:

```sql
grant smith_test to authenticator;
revoke smith_test from anon, authenticated, service_role;
```

No membership or object privilege may be granted to `PUBLIC`, `anon`,
`authenticated` or `service_role`.

### Schema and probe table

Create:

- schema `smith_test`
- table `smith_test.probe`
- owner-scoped RLS policy for `smith_test`

Privileges:

```sql
revoke all on schema smith_test
from public, anon, authenticated, service_role;
grant usage on schema smith_test to smith_test;
grant select, insert, update, delete on smith_test.probe to smith_test;
```

The probe table has no foreign key, view, trigger or dependency on Production
user-data tables.

### Custom Access Token Hook

Proposed function:

```sql
create or replace function public.smith_test_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
begin
  claims := event -> 'claims';

  if claims #>> '{app_metadata,environment}' = 'smith_test' then
    claims := jsonb_set(claims, '{role}', to_jsonb('smith_test'::text));
  end if;

  return jsonb_build_object('claims', claims);
end;
$$;
```

Required grants:

```sql
grant usage on schema public to supabase_auth_admin;
grant execute on function public.smith_test_access_token_hook(jsonb)
to supabase_auth_admin;
revoke execute on function public.smith_test_access_token_hook(jsonb)
from public, anon, authenticated, smith_test;
```

The function is not `SECURITY DEFINER`. It uses only the server-managed
`app_metadata` claim supplied by Auth and never `user_metadata`.

The hook must then be selected manually in Supabase Dashboard under
Authentication Hooks. SQL creation alone does not activate it.

### Exposed schemas

`smith_test` must be added to the hosted Data API exposed schemas so that
PostgREST can route permitted requests. This setting is **not** an authorization
boundary.

Security remains:

`JWT database role + PostgreSQL grants + RLS + Storage policies`

Changing client `db.schema` only selects a route. The negative matrix must use a
default/public client and direct REST to prove that routing cannot bypass the
database boundary.

## User bootstrap impact

The current hosted `public.handle_new_user_role()` inserts every new Auth user
into `public.user_roles`. A `smith_test` identity would therefore currently
enter the Production approval/user system.

The hosted migration must replace the trigger function with the same current
behavior plus an early server-side guard:

```sql
if new.raw_app_meta_data ->> 'environment' = 'smith_test' then
  return new;
end if;
```

Normal users must continue to receive:

```sql
insert into public.user_roles(user_id, role, approved)
values (new.id, 'user', false)
on conflict (user_id) do nothing;
```

The trigger's existing `SECURITY DEFINER` and empty `search_path` must be
preserved. Existing users are not backfilled or modified.

Before approval, Admin Users and Production analytics queries must also be
reviewed for exclusion of test identities. Phase 1A must not create a hosted
test user until that exclusion is proven.

## Storage changes

No new bucket or hosted Storage policy is required for the minimal Phase 1A
application.

The negative test should target the existing private Production `recordings`
bucket and prove denial for the `smith_test` JWT. The local
`production-recordings` bucket is a disposable test fixture and is excluded
from the hosted migration.

Phase 1B may later propose `smith-test-recordings` and
`smith-test-artifacts` in a separate reviewed migration.

## Legacy RPC dependency impact

Read-only inspection found hosted `SECURITY DEFINER` functions:

- `public.claim_chat_receipt(uuid, uuid, text)`
- `public.complete_chat_receipt(uuid, uuid, text, jsonb, text)`

Both currently have execute grants for `anon`, `authenticated` and
`service_role`. Phase 1A must prove that `smith_test` cannot execute them.
Their existing grants must not be changed as part of this migration until a
separate caller/dependency audit is complete.

The new role must not receive `public` schema usage, so direct RPC execution
must fail before function execution.

## Risk classification

**HIGH**

Reasons:

- Auth token role mutation
- new PostgreSQL role and membership
- grants and RLS
- exposed-schema configuration
- Auth user bootstrap behavior
- shared Production Auth system

Local success lowers implementation uncertainty but does not lower the
authorization requirement.

## Dependency impact

- Supabase Auth must invoke the hook for login and refresh.
- PostgREST `authenticator` must be able to `SET ROLE smith_test`.
- Normal `authenticated` tokens must remain unchanged.
- Admin user bootstrap and aggregate queries must exclude test identities.
- Existing public tables, RPCs and Storage policies must remain inaccessible
  to `smith_test`.
- Preview must use only a publishable key and a test-user JWT.

No personal-agent prompt, task semantics or user-facing chat behavior changes
are required.

## Local verification completed

Sanitized evidence:

`docs/smith/evidence/PHASE_1A_LOCAL.json`

Passed locally:

- role attributes: `NOLOGIN`, `NOINHERIT`, no elevated attributes
- membership only through `authenticator`
- real Local Auth login with `app_metadata.environment = smith_test`
- JWT database role becomes `smith_test`
- CRUD on `smith_test.probe`
- denied public table select/insert through an alternate client
- denied public RPC
- denied direct REST request to public
- denied Production-style private Storage upload
- role preserved after refresh and a new session
- normal local user remains `authenticated`
- database lint and security advisors report no issues
- 233/233 repository tests, typecheck and build pass

## Not proved until shared-project application

- hosted Auth invokes the configured hook
- hosted `authenticator` can assume the new role
- token refresh behavior in the hosted Auth deployment
- denial against every actual Production table and both legacy receipt RPCs
- denial against the actual `recordings` bucket
- exclusion from hosted Admin Users and analytics
- interaction with current hosted default privileges and exposed-schema
  settings
- absence of unexpected hosted grants added outside migration history

Any unexpected access is a Phase 1A failure and blocks Phase 1B.

## Preview credential confirmation

Preview design does not use and must never receive:

- `SUPABASE_SERVICE_ROLE_KEY`
- a Supabase secret key
- Production database credentials
- Production Storage credentials

Preview uses a publishable key plus a real `smith_test` user session only.

## Rollback procedure

Rollback is manual, ordered and requires a separate Production approval:

1. Disable the Custom Access Token Hook in the Dashboard so no new
   `smith_test` JWTs are issued.
2. Revoke or terminate all sessions for hosted test identities.
3. Delete the hosted test identity after session invalidation.
4. Remove `smith_test` from exposed schemas.
5. Revoke table/schema privileges from `smith_test`.
6. Drop `smith_test.probe`.
7. Drop schema `smith_test`.
8. Revoke role membership from `authenticator`.
9. Drop role `smith_test`.
10. Drop `public.smith_test_access_token_hook(jsonb)`.
11. Restore the previous, captured definition of
    `public.handle_new_user_role()`.
12. Run advisors and repeat normal-user login/refresh smoke tests.

Rollback must not remove or alter Production user data, receipt functions or
the Production recordings bucket.

## Approval prerequisites

Do not apply until all are true:

- explicit Admin approval for this HIGH-risk operation
- exact hosted migration diff reviewed
- current bootstrap function captured and tested
- Admin/analytics test-user filters implemented
- rollback SQL prepared and reviewed
- test identity creation procedure approved
- Leaked Password Protection state verified
- no Production service credential is present in Preview
