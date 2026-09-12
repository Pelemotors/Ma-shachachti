# Smith Production Gate

Status: **DISCONNECTED**

Production is not a Smith capability. The current code contains validation and
a disconnected executor only.

## Activation requirements

All must be verified in reality:

- protected `main`
- required CI and browser checks
- separate Production Executor identity
- operation-specific manual credentials
- external Admin password re-authentication
- exact-SHA approval verification
- atomic, single-use authorization with a five-minute TTL
- executor unable to run arbitrary shell commands
- audit trail

Code or environment variables alone cannot change the state to Connected.

## Approval evidence

`ProductionApprovalService` must reject unless:

- current user is an approved Admin
- re-authenticated user ID equals the current Admin ID
- Work Item is `approval_requested`
- PR head, Preview, tests and manual QA all match the exact SHA
- no superseding commit exists
- tests passed
- HIGH-risk changes have a security review
- Smith is not the approving actor

Database, Auth/RLS, permissions, secrets, infrastructure and rollback require
operation-specific approvals.

## Authorization

An approved request may create one opaque authorization:

- bound to Admin, Work Item, operation and exact SHA
- expires within five minutes
- stored as a digest
- consumed atomically once
- unusable by Smith

Authorization issuance and consumption are not active while the executor is
Disconnected.

## Password handling

The confirmation route will:

1. require an authenticated Admin session
2. issue a one-time challenge
3. submit the password directly to an isolated server handler
4. call `signInWithPassword` for the current Admin email
5. compare returned user ID with the current Admin ID
6. discard password and re-auth result

Passwords and re-auth tokens must never be logged, persisted, audited or sent
to Smith.

## Rollback

Rollback is a Production mutation and requires:

- new re-authentication
- new operation-specific approval
- new single-use authorization

Smith may prepare rollback evidence but cannot execute it.
