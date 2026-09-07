# Database bootstrap

The repository is the source of truth for schema reconstruction.

1. Apply `database/schema.sql` to an empty Supabase/Postgres project.
2. Apply files in `database/migrations/` in filename order.
3. New Auth users are created as `role=user, approved=false`.
4. Bootstrap the first administrator explicitly with a service-role/operator action; no personal email is encoded in schema or migrations.
5. Verify `app_states`, `push_subscriptions`, `reminder_queue`, `action_receipts` and `chat_receipts` reject unapproved users through RLS.
6. Verify `admin_set_user_access` is executable only by `service_role` and cannot remove the final approved admin.
7. Verify action/chat retries are idempotent and reject reuse of an idempotency key for a different request.
8. Run `npm test` and the Supabase security advisor after schema changes.

Production migrations applied on 2026-09-07 are represented by the repository migrations. The final RLS helper functions live in the non-exposed `private` schema. The legacy three-argument action idempotency RPC is removed after the hashed four-argument variant is deployed.
