# Database bootstrap

The repository is the source of truth for schema reconstruction.

1. Apply `database/schema.sql` to an empty Supabase/Postgres project.
2. Apply files in `database/migrations/` in filename order.
3. New Auth users are created as `role=user, approved=false`.
4. Bootstrap the first administrator explicitly with a service-role/operator action; no personal email is encoded in schema or migrations.
5. Verify `app_states`, `push_subscriptions`, `reminder_queue`, `action_receipts`, `chat_receipts` and `pending_proposals` reject unapproved users through RLS.
6. Verify `admin_set_user_access` is executable only by `service_role` and cannot remove the final approved admin.
7. Verify action/chat retries are idempotent and reject reuse of an idempotency key for a different request.
8. Run `npm test` and the Supabase security advisor after schema changes.

Production migrations applied on 2026-09-07 are represented by the repository migrations. The final RLS helper functions live in the non-exposed `private` schema. The legacy three-argument action idempotency RPC is removed after the hashed four-argument variant is deployed.

`pending_proposals` (domain 1) is created by `20260908_pending_proposals_table.sql` and was applied on Production as `pending_proposals_table`. State V2 acceptance in `save_app_state` is in `20260907_state_v2_pending_proposals.sql` and was applied on Production as `save_app_state_accept_schema_v2`. Existing `app_states` rows may remain `schemaVersion` 1 until the next successful cloud save; reads migrate V1→V2 in memory via `migrateState`.
