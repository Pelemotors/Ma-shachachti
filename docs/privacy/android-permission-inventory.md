# Android permission inventory — מה שכחתי?

**Policy version:** `2026-09-18`  
**Related policy section:** Android device permissions (mic / notifications / internet; no contacts or location in current product).

Two Android application IDs exist in this repository. Disclosures and Play Console entries must match the **shipped** binary (`REQUIRES_DECISION` which package is published).

---

## A. Capacitor Android — `il.co.mashachachti.app`

**Manifest:** `android/app/src/main/AndroidManifest.xml`  
**Config:** `capacitor.config.json` (`appId`: `il.co.mashachachti.app`)

### Declared uses-permission

| Permission | Declared | Runtime prompt | Product use | Data linked | Status |
|---|---|---|---|---|---|
| `INTERNET` | Yes | No (normal) | Sync with https://mashachachti.co.il APIs / auth / Storage | Account + product traffic over HTTPS | Required |
| `RECORD_AUDIO` | Yes | Yes (dangerous) | User-initiated voice capture for transcription / agent | Raw audio → Storage `recordings` + OpenAI transcription | Required for voice |
| `POST_NOTIFICATIONS` | Yes | Yes (API 33+) | Reminder / update notifications | Push token + generic lock body | Required for push UX |

### Not declared (Capacitor manifest)

| Permission class | Present? | Policy alignment |
|---|---|---|
| Contacts | No | Matches “no contacts” claim |
| Location (fine/coarse) | No | Matches “no location” claim |
| Camera | No | Not used in Capacitor manifest |
| External storage read/write | No | Not declared on Capacitor manifest |

### Intent filters (not permissions, but data ingress)

| Intent | MIME / data | Privacy note |
|---|---|---|
| `SEND` | `text/plain`, `image/*` | Share-into-app; images/text supplied by user/OS share sheet |
| `SEND_MULTIPLE` | `image/*` | Same |
| App Links | `https://mashachachti.co.il/app` (+ www) | Deep link only |

**Mic disclosure:** in-app disclosure before first mic OS prompt (`ensureMicDisclosureAccepted` on web/Capacitor path).

**FCM:** Manifest comments that FCM MessagingService is added when `google-services.json` is supplied — treat Production FCM enablement as `UNVERIFIED` unless ops confirms.

---

## B. Expo foundation — `com.mashachachti.app`

**Config:** `apps/mobile/app.config.ts`  
**Package:** `com.mashachachti.app`  
**Product name:** מה שכחתי?

### Effective / intended permission posture (foundation)

| Permission | Status in foundation | Notes |
|---|---|---|
| `INTERNET` | Present (platform default for networked app) | API base → mashachachti.co.il |
| `VIBRATE` | Present per product fact / typical Expo baseline | Haptics/notification feel — confirm in merged manifest of a release build (`UNVERIFIED` until APK merge inspected) |
| `RECORD_AUDIO` | **Blocked** in `android.blockedPermissions` | Voice feature gated for foundation |
| `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` | **Blocked** | Least permission foundation |
| `CAMERA` | **Blocked** | — |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | **Blocked** | — |
| `READ_CONTACTS` | **Blocked** | — |
| `SYSTEM_ALERT_WINDOW` | **Blocked** | — |

### Mic disclosure (Expo)

`MicDisclosureModal` / mic disclosure gate exists for when RECORD_AUDIO is enabled later. Foundation currently blocks RECORD_AUDIO at config level.

---

## Comparison

| Capability | Capacitor `il.co.mashachachti.app` | Expo `com.mashachachti.app` (foundation) |
|---|---|---|
| Network | Yes | Yes |
| Microphone | Declared | Blocked |
| Notifications permission | `POST_NOTIFICATIONS` declared | Not declared in foundation facts (push may be added later) |
| Share image intents | Yes | App Links only in config shown |
| Contacts / location / camera | No | Explicitly blocked |

---

## Play Console implications

1. Data Safety and permission declarations must match the **uploaded AAB/APK**, not both trees.
2. If Capacitor is the store app: declare microphone + notifications + audio collection.
3. If Expo foundation is the store app: do **not** claim microphone collection until `RECORD_AUDIO` is unblocked and shipped.
4. Package ID mismatch between store listing and privacy copy is a **High** severity disclosure bug if left unresolved (`REQUIRES_DECISION`).

## Open items

| Item | Classification |
|---|---|
| Which package ID ships to Google Play | REQUIRES_DECISION |
| Merged Expo release manifest (confirm VIBRATE/INTERNET only) | UNVERIFIED |
| Production FCM wiring for Capacitor | UNVERIFIED |
