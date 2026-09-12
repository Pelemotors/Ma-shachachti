# מה שכחתי? — חבילת אבטחה, פרטיות ומיקור חוץ

תאריך: 12.09.2026  
בסיס קוד: `feature/smith-control-center @ 372a0a9e747bf4365022ef1387e21225a54aebec`  
Production baseline שנבדק לצורך dependency audit: `main @ 39e5c8b3d52b3c2d0e15612fda2f807530961c79`  
Supabase project: `mrggiqhxngoibhurinlk`  
יעד: הכנה למעבר ל-Hetzner Germany / VPS.

> מסמך עבודה טכני-ארגוני; אינו מחליף ייעוץ משפטי פרטני.

## 02 — תוכנית אבטחת מידע

### מצב קיים שנבדק

- RLS פעיל על כל 25 טבלאות application ב-`public`.
- טבלאות מרכזיות מבודדות לפי `auth.uid()`.
- Admin דורש משתמש מאומת, `approved=true`, `role=admin`.
- Recording bucket private ומבודד לפי user folder.
- OpenAI key server-side; Responses API משתמש ב-`store:false`.
- Smith Agent כבוי; Preview/ProductionExecutor מנותקים.

### P0 שתוקן ב-12.09.2026

שתי פונקציות legacy `SECURITY DEFINER`:

- `public.claim_chat_receipt(uuid, uuid, text)`
- `public.complete_chat_receipt(uuid, uuid, text, jsonb, text)`

היו עם EXECUTE ל-`anon` ול-`authenticated`. Dependency audit הראה שה-code path הנוכחי ב-feature וגם ב-main משתמש ב-`agent_turns` ישירות ולא תלוי בהן.

בוצעה Production migration:
`20260912182738 restrict_legacy_chat_receipt_rpc_execute`

אחרי migration:

- anon execute: false
- authenticated execute: false
- service_role execute: true

Security Advisor נבדק שוב; warnings אלה נעלמו.

### לפני VPS Production Cutover

**Auth**

- MFA חובה ל-Admin (AAL2 target).
- breached-password protection או equivalent.
- rate limiting / brute-force protection.
- session revocation בחסימה/מחיקה.
- re-auth לפעולות Admin בעלות השפעה גבוהה.

**Network/VPS**

- Germany/EU.
- public ports: 80/443 בלבד.
- SSH keys only, no root login.
- עדיפות ל-management VPN / allowlist.
- Hetzner Cloud Firewall + host firewall.
- PostgreSQL ללא public listener.
- TLS חובה.

**OS**

- Ubuntu 24.04 LTS או release מאושר.
- security updates, minimal services, monitoring, time sync.

**Secrets**

- אין secrets ב-Git.
- אין secret תחת `NEXT_PUBLIC_`.
- root-owned/secrets mechanism, `0600`.
- rotation procedure.
- no secrets in logs.

**Database**

- private-only.
- least privilege.
- RLS defense in depth.
- `SECURITY DEFINER` רק כשנדרש עם grants מפורשים.
- migrations בלבד לשינוי Production schema.
- restore test חודשי.

**Storage**

- private by default.
- user-scoped paths.
- MIME/size allowlists.
- orphan cleanup.
- raw audio max 7 days.

**AI**

- minimum necessary context.
- לעולם לא לשלוח auth tokens, API keys, push endpoints, secrets או unrelated Admin telemetry.
- `store:false` היכן שנתמך.
- raw audio רק בתמלול מפורש.
- minimization לא יהפוך ל-router קשיח שחונק את ה-LLM.

**Admin**

- MFA.
- audit לשינויי הרשאה ופעולות high-impact.
- no arbitrary shell diagnostics.
- Production actions רק באישור Admin מפורש.

**Smith**

- OFF by default וללא Production credentials.
- אם יופעל אוטונומית בעתיד: VPS/VM נפרד; אין Docker socket/root ב-Production; אין auto-deploy.

### Logging

1. Operational telemetry: 90 ימים.
2. Security/Admin audit: 24 חודשים כאשר מדובר בנתוני אבטחה טכניים הנדרשים לשמירה.
3. User content: לא נרשם כ-log.

### Backup & Recovery

- RPO <= 1 hour.
- RTO <= 4 hours.
- client-side encrypted, off-host.
- rolling max 30 days.
- frequent/continuous DB WAL/incremental + regular base backup.
- storage objects encrypted.
- monthly restore drill.
- backup credentials מופרדים מ-app write credentials.

### Incident response

Detect -> contain -> revoke credentials/sessions -> preserve evidence -> assess data/users -> restore if needed -> legal notification assessment -> corrective actions -> post-incident review.

### Go-live gate

- [ ] Hetzner DPA active
- [ ] Germany/EU verified
- [ ] Admin MFA
- [ ] firewall/SSH baseline
- [ ] DB private
- [ ] encrypted backups + restore test
- [ ] account deletion tested
- [ ] audio retention tested
- [ ] log classification/retention configured
- [ ] OpenAI processor mapping documented
- [ ] secrets rotation test
- [ ] security audit clean/exceptions documented
