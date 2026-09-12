# Smith GitHub Setup

Status: **DISCONNECTED**

The current repository has no verified `main` ruleset. Smith Git mutation must
remain disabled until protection is proven.

## Local-first boundary

The code in this project is still built through:

`local edit → local tests/build → local commit → feature-branch push → Preview`

The future Smith runner must not be used to build Smith Control Center itself
until the runner has been implemented, tested and approved.

## Required Smith GitHub App

Create a repository-scoped App with only:

- Metadata: read
- Contents: read/write
- Pull requests: read/write
- Checks: read/write only if the final runner requires it

Do not grant:

- Administration
- Environments
- Secrets
- Actions administration
- Branch-protection bypass
- Organization-wide repository access

Store App credentials in GitHub Actions secrets, never in Smith DB, prompts,
transcripts or Preview variables.

## Required `main` ruleset

- pull request required
- required CI and browser checks
- force push disabled
- deletion disabled
- Smith App is not a bypass actor
- sensitive paths require CODEOWNERS review

Verification must include an actual denied Smith push and merge attempt against
`main`.

## Branch contract

Smith may create only:

`smith/<work-item-uuid>-<short-slug>`

`lib/smith/git-policy.ts` rejects `main`, the Smith build branch, Lean and
legacy reference branches. A full 40-character base SHA is required.

## Webhook

Endpoint:

`POST /api/smith/github/webhook`

It requires:

- `X-Hub-Signature-256` HMAC verification
- valid `X-GitHub-Delivery`
- idempotency through `smith_jobs.idempotency_key`
- allowlisted persisted metadata
- secret redaction

Without the webhook secret or an enabled control plane it returns a
Disconnected response and performs no mutation.

## Runner activation prerequisites

- protected `main` verified
- dedicated Smith App installed
- bounded workflow reviewed
- Cursor SDK service credential stored only in Actions
- fresh checkout of exact base SHA
- maximum iterations configured
- tests and Preview provider operational
- negative branch-target tests passing

`scripts/smith-runner.ts` is the future local-runtime entrypoint. It uses the
TypeScript Cursor SDK one-shot pattern against an explicit checkout directory.
It fails closed unless `SMITH_RUNNER_ENABLED=true`, requires a clean bounded
branch at an exact base SHA, strips ambient GitHub/Production credentials,
removes the Actions checkout push header, restricts tools and validates all
changed paths after the run. It does not push.

No active runner workflow is installed at the current milestone. Activation
must use a separate host step to validate and push the bounded branch after the
SDK process exits; Git credentials must never be available inside the SDK
agent's shell.
