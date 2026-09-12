# מה שכחתי? — חבילת אבטחה, פרטיות ומיקור חוץ

תאריך: 12.09.2026  
בסיס קוד: `feature/smith-control-center @ 372a0a9e747bf4365022ef1387e21225a54aebec`  
Production baseline שנבדק: `main @ 39e5c8b3d52b3c2d0e15612fda2f807530961c79`  
Supabase project: `mrggiqhxngoibhurinlk`

> מסמך עבודה טכני-ארגוני; אינו מחליף ייעוץ משפטי פרטני.

## 03 — הערכת סיכונים

### שיטת דירוג

Likelihood ו-Impact: 1–5.  
Inherent risk = L × I.  
15–25 High, 8–14 Medium, 1–7 Low.

| ID  | סיכון                                            |   L |   I |  Inherent | טיפול/בקרה                                                        | Residual          |
| --- | ------------------------------------------------ | --: | --: | --------: | ----------------------------------------------------------------- | ----------------- |
| R01 | גישה לנתוני משתמש אחר                            |   3 |   5 |   15 High | RLS owner policies + server auth + ownership tests                | Low/Med           |
| R02 | SECURITY DEFINER RPC חשוף                        |   3 |   5 |   15 High | **תוקן 12.09.26**: revoke anon/authenticated + advisor re-check   | Low               |
| R03 | השתלטות על Admin                                 |   3 |   5 |   15 High | role/approved קיימים; MFA/re-auth נדרשים                          | Medium until MFA  |
| R04 | credential stuffing / leaked password            |   3 |   4 | 12 Medium | strong password + breached-password check + rate limits           | Medium until done |
| R05 | פריצת VPS דרך SSH/service                        |   3 |   5 |   15 High | firewall, keys only, no root, VPN/allowlist, patching             | Low/Med           |
| R06 | DB פתוח לאינטרנט                                 |   2 |   5 | 10 Medium | private bind/network בלבד                                         | Low               |
| R07 | secret leak                                      |   3 |   5 |   15 High | secrets policy, redaction, rotation, CI scanning                  | Low/Med           |
| R08 | גניבת backup                                     |   3 |   5 |   15 High | client-side encryption + separate creds                           | Low/Med           |
| R09 | backup לא ניתן לשחזור                            |   3 |   5 |   15 High | restore drills + RPO/RTO evidence                                 | Low/Med           |
| R10 | outage משותף Hetzner+backup                      |   2 |   5 | 10 Medium | מתקבל זמנית לפשטות; second-provider encrypted copy בעת scale      | Medium            |
| R11 | יותר מדי context נשלח ל-OpenAI                   |   3 |   4 | 12 Medium | context minimization + field exclusions + provider review         | Medium            |
| R12 | מידע רגיש מוזן בטקסט/קול                         |   4 |   5 |   20 High | treat free text/audio as potentially sensitive                    | Medium            |
| R13 | raw audio נשמר יותר מדי                          |   2 |   4 |  8 Medium | 7-day retention + cron evidence + user delete                     | Low               |
| R14 | transcript ללא control מחיקה                     |   3 |   4 | 12 Medium | delete content/account + documented retention                     | Low/Med           |
| R15 | telemetry מכיל בטעות user content/secrets        |   3 |   4 | 12 Medium | allowlist/redaction + tests + no-content policy                   | Low/Med           |
| R16 | push subscription leak                           |   2 |   3 |     6 Low | owner RLS + no logs + purge invalid/account deletion              | Low               |
| R17 | stale sessions אחרי חסימה/מחיקה                  |   3 |   4 | 12 Medium | revoke sessions; validate sensitive operations                    | Low/Med           |
| R18 | Smith מגיע ל-Production                          |   2 |   5 | 10 Medium | Smith OFF, no prod creds, future separate compute + approval gate | Low now           |
| R19 | dependency/supply-chain compromise               |   3 |   4 | 12 Medium | lockfile/pinning/CI review/image provenance                       | Medium            |
| R20 | OS/container לא patched                          |   3 |   5 |   15 High | security updates + CVE review                                     | Low/Med           |
| R21 | self-hosted Supabase misconfiguration            |   3 |   5 |   15 High | official current config + internal DB + RLS/grants audit          | Medium            |
| R22 | Hetzner/subprocessor access                      |   2 |   5 | 10 Medium | DPA/TOMs + EU location + subprocessor review                      | Low/Med           |
| R23 | onward transfer ללא control                      |   2 |   5 | 10 Medium | DPA + Article 3 review + documented authorization                 | Low/Med           |
| R24 | account deletion חלקית                           |   3 |   5 |   15 High | deletion workflow + storage/push/queue purge + verification       | Medium until done |
| R25 | מחיקת security logs מוקדם מדי                    |   3 |   3 |  9 Medium | dedicated audit class, 24-month retention where required          | Low               |
| R26 | legacy `app_states` משמר duplicate personal data |   3 |   4 | 12 Medium | verify SOT + retirement plan + controlled purge                   | Medium            |
| R27 | orphan raw audio after failure                   |   2 |   4 |  8 Medium | orphan cleanup + DB/object reconciliation                         | Low/Med           |
| R28 | corruption בזמן VPS migration                    |   3 |   5 |   15 High | rehearsal, counts/checksums, rollback, cutover controls           | Low/Med           |

### פעולות בעדיפות עליונה

**בוצע:** R02.  
**לפני VPS Production:** R03, R05/R06, R08/R09, R11/R15, R21, R24.

### Risk acceptance

- **Single provider:** מתקבל זמנית לצורך פשטות אם backup off-host ומוצפן. נשקול copy מוצפן לספק שני עם גדילת הסיכון.
- **OpenAI:** נדרש לפונקציונליות agent/transcription; mitigation באמצעות minimization, contracts, server-side credentials ו-`store:false` היכן שנתמך.
- **Free text:** לא נטען שאין מידע רגיש; נגן עליו כאילו עשוי לכלול כזה.
