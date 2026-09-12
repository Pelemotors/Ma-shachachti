# מה שכחתי? — חבילת אבטחה, פרטיות ומיקור חוץ

תאריך: 12.09.2026  
בסיס קוד: `feature/smith-control-center @ 372a0a9e747bf4365022ef1387e21225a54aebec`  
Production baseline: `main @ 39e5c8b3d52b3c2d0e15612fda2f807530961c79`

> מסמך עבודה טכני-ארגוני; אינו מחליף ייעוץ משפטי פרטני.

## 05 — החלטות מדיניות — Working Policy v1

### Retention

- Raw audio: מקסימום 7 ימים אחרי תמלול מוצלח.
- Transcript: עד מחיקת ההקלטה/התוכן או החשבון.
- Chat: עד מחיקת השיחה או החשבון.
- Tasks/lists/memory/profile: עד מחיקה יזומה/מחיקת חשבון.
- Operational telemetry: 90 ימים.
- Security/Admin technical audit: 24 חודשים כאשר חלה חובת שמירת נתוני אבטחה.
- Backups: rolling max 30 ימים.
- Terminal reminders: 90 ימים, מלבד security audit data.

### User deletion

- block live access immediately.
- purge live user data target: within 24h from verified request.
- backups age out within max 30 days.
- retain only minimum justified non-content audit data.

### Admin

- MFA required before VPS production cutover.
- high-impact actions require re-auth/explicit confirmation.
- no shared Admin accounts.

### Password/Auth

- strong minimum password policy.
- breached-password protection or equivalent.
- brute-force/rate limiting.
- revoke sessions on disable/delete.
- no authorization decisions based on user-editable metadata.

### OpenAI minimization

Allowed by need: user message, relevant recent conversation, relevant tasks/lists/memory/profile.  
Forbidden by default: auth/refresh tokens, passwords, API keys, push endpoints/subscription secrets, raw Admin logs, unrelated user data, infrastructure credentials.

### Backups

- RPO <=1h.
- RTO <=4h.
- client-side encrypted.
- off-host.
- restore drill monthly.
- backup credentials isolated from application write credentials.

### Legacy data

`app_states` and other duplicate legacy stores are not deleted until:

1. Lean Source of Truth verified.
2. no runtime dependency.
3. rollback window approved.
4. necessary export/snapshot retained.
5. purge documented.
