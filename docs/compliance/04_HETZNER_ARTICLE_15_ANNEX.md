# מה שכחתי? — חבילת אבטחה, פרטיות ומיקור חוץ

תאריך: 12.09.2026  
בסיס קוד: `feature/smith-control-center @ 372a0a9e747bf4365022ef1387e21225a54aebec`  
Production baseline שנבדק: `main @ 39e5c8b3d52b3c2d0e15612fda2f807530961c79`  
Supabase project: `mrggiqhxngoibhurinlk`

> מסמך עבודה טכני-ארגוני; אינו מחליף ייעוץ משפטי פרטני.

## 04 — נספח מיקור חוץ / תקנה 15 — Hetzner

### סטטוס

Draft operational annex to accompany the Hetzner DPA.  
Controller legal name / registration details: **TBD before signature**.  
Hetzner product + exact datacenter: **Germany/EU to be recorded before processing real-user data**.

### 1. תפקידים

**Controller / בעל השליטה:** מפעיל "מה שכחתי?" — פרטי ישות משפטית יושלמו.  
**Processor:** Hetzner Online GmbH לפי DPA פעיל בחשבון הלקוח.

### 2. מטרת השירות

אירוח/הפעלת השירות, כולל compute, networking, database/storage/backup לפי המוצרים שיוזמנו. אין הרשאה להשתמש במידע למטרה עצמאית מעבר למתן השירות ולדין החל.

### 3. נושאי מידע

- משתמשי האפליקציה;
- Admins;
- בני בית/אחרים המוזכרים בטקסט או קול;
- support contacts אם יתווספו.

### 4. סוגי מידע

- email/account identifiers;
- profile/preferences;
- household/life tasks;
- shopping/checklists;
- chat content;
- agent memory;
- schedules/reminders;
- voice transcripts;
- temporary raw audio;
- push/device subscription metadata;
- technical/security logs;
- agent decisions/actions.

טקסט ואודיו חופשיים עלולים להכיל מידע רגיש ולכן יטופלו בהתאם.

### 5. מערכות שאליהן עשויה להיות לספק גישה

לפי הצורך התשתיתי בלבד:

- VPS/Cloud resources;
- disks/volumes;
- network infrastructure;
- backup/storage;
- support systems בעת פנייה.

Hetzner אינה מקבלת application-level Admin account רגיל.

### 6. פעולות עיבוד מותרות

Hosting, storage, transmission, backup/restore, availability, maintenance/support לפי הוראות Controller, deletion/return בסיום.

### 7. מיקום

Working selection: **Germany / EU**.  
שינוי מחוץ ל-EU דורש בדיקה מתועדת של בסיס ההעברה, Article 3 assurances, subprocessors והודעת הפרטיות לפי הצורך.

### 8. אבטחה

Hetzner: DPA + TOMs העדכניים.  
Controller: firewall, SSH keys-only/no-root, patching, TLS, secrets management, private DB, least privilege, RLS/authorization, encrypted backups, monitoring/audit, incident response.

ב-Cloud/Dedicated Server, ניהול מערכת ההפעלה וה-application הוא באחריות Controller.

### 9. Subprocessors / onward transfer

- לשמור current subprocessor list ב-evidence.
- לבדוק שינוי מהותי בהתאם למנגנון DPA.
- Controller authorizes onward transfers רק בכפוף ל-DPA, הדין החל והדרישות הישראליות.
- חובות רלוונטיות יחולו גם על subprocessor שמקבל גישה בפועל.

### 10. סודיות והרשאות

- גישת אנשי ספק רק לצורך השירות/support.
- Admin least privilege.
- MFA.
- named access.
- periodic review.
- no shared root credentials.

### 11. Security incident

Supplier פועל לפי DPA notification/cooperation.  
Controller: triage, containment, session/credential revocation, evidence preservation, impact assessment, notification assessment, remediation.

### 12. פיקוח

לפחות אחת לשנה ולאחר שינוי מהותי:

- DPA active;
- current TOMs;
- subprocessors;
- available audit/assurance evidence;
- datacenter location;
- internal firewall/SSH/backups/restore evidence;
- incidents.

### 13. סיום התקשרות

1. export.
2. verify integrity.
3. revoke credentials.
4. delete workloads/volumes/snapshots/backups.
5. retain deletion evidence where available.
6. update processor register/privacy docs.

### 14. Article 3 — Transfer Abroad

מסגרת ההתחייבות המיועדת:

- executed Hetzner DPA;
- Hetzner TOMs;
- subprocessor terms/list;
- Germany/EU location;
- annex זה;
- Data Map + Risk Assessment.

### 15. OpenAI הוא Processor נפרד

Hetzner Annex אינו מכסה OpenAI. יש לנהל רישום נפרד עבור Responses + audio transcription, סוגי מידע, תנאים, מיקומים/subprocessors ו-retention.

### 16. Evidence

- executed DPA;
- TOMs;
- subprocessor list;
- order/location evidence;
- firewall/SSH policy;
- backup config + restore test;
- annual review;
- incidents;
- annex + risk assessment.

### 17. אישור

Controller representative: ____________________  
Date: ____________________  
Version: 1.0  
Legal review: ____________________
