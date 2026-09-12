# Security readiness tracker

Statuses used below:

- `COMPLETED` — verified in the current product or already applied on Production
- `REQUIRED BEFORE VPS PRODUCTION` — must exist before a VPS Production cutover
- `LATER / SCALE` — not required for the first VPS Production step

No item in the last two groups is implemented by this documentation commit.

## COMPLETED

- RLS enabled across current public application tables.
- User ownership isolation.
- private recording bucket.
- raw audio 7-day retention mechanism.
- OpenAI Responses `store:false`.
- legacy chat receipt `SECURITY DEFINER` EXECUTE hardening.
- Smith Agent OFF.
- ProductionExecutor disconnected.

## REQUIRED BEFORE VPS PRODUCTION

- Admin MFA.
- breached-password protection or equivalent.
- brute-force/rate limiting.
- complete account deletion workflow.
- session revocation on disable/delete.
- VPS firewall.
- SSH keys only.
- root SSH disabled.
- PostgreSQL private only.
- secrets management.
- encrypted off-host backups.
- restore drill.
- RPO <= 1 hour.
- RTO <= 4 hours.
- telemetry retention enforcement.
- security audit retention.
- raw audio cleanup verification.
- orphan recording cleanup.
- OpenAI processor documentation.
- Hetzner DPA signed.
- Germany/EU server location recorded.
- Hetzner subprocessors review.
- Regulation 15 annual review process.

## LATER / SCALE

- second-provider encrypted backup copy.
- separate Smith VPS/VM if autonomous Smith is enabled.
- advanced SIEM/security monitoring.
- automated vulnerability scanning.

## Next P1 sequence

Do not start these in this commit. Planned order only:

1. Admin MFA
2. Account deletion
3. Backup/restore
4. Auth hardening
5. Retention enforcement
