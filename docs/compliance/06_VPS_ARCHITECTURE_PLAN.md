# מה שכחתי? — חבילת אבטחה, פרטיות ומיקור חוץ

תאריך: 12.09.2026  
בסיס קוד: `feature/smith-control-center @ 372a0a9e747bf4365022ef1387e21225a54aebec`  
Production baseline: `main @ 39e5c8b3d52b3c2d0e15612fda2f807530961c79`

> מסמך עבודה טכני-ארגוני; אינו מחליף ייעוץ משפטי פרטני.

## 06 — תוכנית ארכיטקטורת VPS — Hetzner Germany

### עיקרון

`Admin Control Center = active`  
`Smith Agent = OFF`

### Target topology

```text
Internet
  |
Hetzner Cloud Firewall
  |
Reverse Proxy / TLS
  |
  +--> Next.js App
  +--> Auth/API services
  +--> Storage service
  +--> PostgreSQL (private only)

Admin -> management VPN / allowlisted SSH -> host
Postgres + storage -> encrypted off-host backup
```

### Exposure

Public: 80/443 בלבד.  
SSH: keys-only, no root, עדיפות ל-VPN/allowlist.  
Never public: Postgres, internal Auth/REST/Storage ports, Docker socket/daemon, DB admin tools.

### Isolation

בשלב הראשון ניתן לארח Production stack על VPS אחד עם container/network isolation, אך backups חייבים להיות off-host.  
אם Smith יהפוך אוטונומי: VPS/VM נפרד, ללא Production Docker socket/root/credentials.

### Self-hosted Supabase direction

מאחר שהאפליקציה נשענת על Supabase Auth, RLS/Postgres, Storage ו-client semantics, מסלול migration בעל rewrite מינימלי הוא לבחון את **ה-self-hosted Supabase stack הרשמי והעדכני** בעת המעבר. אין להסתמך על מדריכי deployment ישנים; יש להצמיד גרסאות ולבצע audit ל-config הנוכחי בזמן ההגירה.

### Containers

- reverse proxy
- app
- auth/gateway stack
- Postgres
- storage
- scheduler/cron
- observability

Rules: internal network, no privileged app container, no host Docker socket, explicit resource limits, pinned versions, healthchecks.

### Database

- local NVMe/SSD.
- no live DB on network filesystem.
- private bind only.
- separate roles.
- RLS retained.
- reviewed migration files only.
- audit SECURITY DEFINER/grants after migrations.
- PITR-capable backup target.

### Backup

- frequent/continuous WAL/incremental archive for RPO <=1h.
- daily base/full backup.
- encrypted incremental object-storage backup.
- rolling max 30d.
- monthly isolated restore drill.
- same-provider correlated risk accepted temporarily and tracked as R10.

### TLS / Web

- automatic certificate renewal.
- HSTS after stable HTTPS.
- secure cookies.
- CSP.
- X-Content-Type-Options.
- Referrer-Policy.
- frame protection.
- body limits.
- rate limits on auth/admin/high-cost AI endpoints.

### Monitoring

Uptime, CPU/RAM/disk, disk fill, DB health, 5xx, auth failures, AI failure/latency, reminder failures, backup success, restore evidence, certificate expiry.

### Deployment flow

```text
Local -> tests/typecheck/build -> commit -> GitHub exact SHA
-> immutable artifact/image -> Preview/Test -> Admin approval
-> Production exact SHA -> health/smoke
```

No Smith auto-deploy.

### Migration phases

**A Prepare:** DPA, Germany, VPS, OS/network hardening, pinned stack, empty DB/storage, encrypted backups.  
**B Rehearsal:** sanitized/test copy, Auth/RLS/Storage validation, tests, restore drill, downtime measurement.  
**C Production:** read-only/cutover plan, final sync, integrity checks, DNS switch, smoke/auth/AI/push/reminder checks, rollback preserved.  
**D Stabilize:** monitor 24–72h, rotate credentials, verify backup, retire old providers only after rollback window.

### Go/No-Go

- [ ] DPA active
- [ ] Germany/EU verified
- [ ] firewall verified
- [ ] SSH keys-only/no root
- [ ] Admin MFA
- [ ] DB private
- [ ] secrets protected
- [ ] backup + restore passed
- [ ] RPO/RTO evidence
- [ ] RLS audit
- [ ] account deletion test
- [ ] audio retention test
- [ ] OpenAI mapping complete
- [ ] Production approval gate preserved
- [ ] Smith OFF/no prod credentials
