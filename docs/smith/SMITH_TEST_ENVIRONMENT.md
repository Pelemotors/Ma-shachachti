# Smith Test Environment

## Current state

Phase 1A is implemented and verified against **Supabase Local only**.

- Local project ID: `mashachachti-smith-clean`
- Local API: loopback only
- PostgreSQL, Auth, PostgREST and Storage run in the local container stack.
- No Production data or Production secret is copied into the stack.
- The repository is not linked by this workflow to a hosted Supabase project.
- The Phase 1A migration must not be pushed to a hosted project without a
  separate, explicit approval.

## Local workflow

The CLI is installed as the project's `supabase` development dependency.
Before using a command, inspect its current help:

```powershell
.\node_modules\.bin\supabase.cmd --version
.\node_modules\.bin\supabase.cmd --help
.\node_modules\.bin\supabase.cmd <command> --help
```

Start and reset only the local stack:

```powershell
docker context use default
.\node_modules\.bin\supabase.cmd start
.\node_modules\.bin\supabase.cmd db reset --local --no-seed
npm run smith:poc
```

Never add `--linked`, a hosted project ref or a hosted database URL to the POC
commands.

## Security model proved by Phase 1A

`smith_test` is a PostgreSQL role with:

- `NOLOGIN`
- `NOINHERIT`
- no superuser, database creation, role creation or replication privilege
- membership granted only to PostgREST's `authenticator`
- no membership granted to `anon`, `authenticated` or `service_role`

The local Custom Access Token Hook changes the database `role` claim to
`smith_test` only when server-managed
`app_metadata.environment == "smith_test"`. Normal local users remain
`authenticated`.

The `smith_test` schema is exposed to the local Data API for routing, but access
is enforced independently with role grants and RLS. The role has no usage on
the local representative `public` schema.

## Automated evidence

Run:

```powershell
npm run smith:poc
```

The runner:

1. Refuses any API URL that is not `http://127.0.0.1`.
2. Creates two temporary local Auth users.
3. Assigns the test marker through `app_metadata`.
4. Uses a real locally issued JWT.
5. Proves CRUD on `smith_test.probe`.
6. Proves denial for a public table, public RPC, direct REST, an alternate
   Supabase client and a Production-style private Storage bucket.
7. Proves the role survives refresh and a new sign-in.
8. Proves a normal user remains `authenticated`.
9. Deletes the temporary Auth users.
10. Writes sanitized evidence to
    `docs/smith/evidence/PHASE_1A_LOCAL.json`.

The evidence contains role names, denial status and sanitized database errors.
It never contains JWTs, passwords, API keys, refresh tokens or connection
strings.

## Verification commands

```powershell
.\node_modules\.bin\supabase.cmd db lint --local --schema public,smith_test --level warning --fail-on error
.\node_modules\.bin\supabase.cmd db advisors --local --type security --level warn --fail-on error
npm test
npm run typecheck
npm run build
```

## Production gate

Successful local evidence does not authorize applying any part of this design
to Production. Before a hosted migration, the Admin must explicitly approve:

- `smith_test` schema and grants
- PostgreSQL `smith_test` role membership
- Custom Access Token Hook activation
- test identity bootstrap changes
- Storage buckets and policies

Until then, the hosted environment remains unchanged.
