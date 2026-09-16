# Mobile Platform Readiness — מה שכחתי?

## Architecture boundaries

| Layer | Responsibility |
|-------|----------------|
| **SERVER** | Supabase DB, Agent, Memory, Reminders, identity verification, notification decisions, RLS |
| **SHARED** | Next.js UI/product: Home, Tasks, Shopping, Schedule, Chat, Capture orchestration |
| **NATIVE_BRIDGE** | `lib/native/contracts.ts` + Capacitor `MaNative` plugin adapters |
| **IOS_NATIVE** | Apple Auth, APNs token, Share Extension, Keychain, Universal Links, mic |
| **ANDROID_NATIVE** | Google Auth handoff, FCM token storage path, Share intents, App Links, mic |

Native tooling: **Capacitor 7** — reuses the existing Next.js shared product inside a native shell instead of rewriting UI in SwiftUI/Compose.

## Bundle / package IDs

- iOS Bundle ID: `il.co.mashachachti.app`
- Android applicationId: `il.co.mashachachti.app`
- App Group: `group.il.co.mashachachti.app`
- Associated Domains: `applinks:mashachachti.co.il`, `applinks:www.mashachachti.co.il`

## Shared native contract

`lib/native/contracts.ts` — `NativeCapability`  
Web fallback: `lib/native/web-adapter.ts`  
Capacitor bridge: `lib/native/capacitor-adapter.ts`

## Server modules

- Identity: `lib/auth/identity.ts`, `lib/auth/verify-jwt.ts`, `lib/auth/native-session.ts`
- APIs: `/api/auth/native`, `/api/auth/identities`, `/api/devices`, `/api/notifications`, `/api/captures`, `/api/mobile/version`, `/api/telemetry`, `/api/account/export`, `/api/account/delete`
- Notifications: `lib/notifications/*` (domain record + APNs/FCM delivery when credentials exist)
- Migration (QA/local only): `database/migrations/20260916_mobile_platform_foundation.sql`

## Apple owner setup (`OWNER_REQUIRED`)

1. Apple Developer: App ID with Sign in with Apple, Push, Associated Domains, App Groups
2. Create APNs key (.p8) → set `APNS_KEY_P8`, `APNS_KEY_ID`, `APPLE_TEAM_ID`, `APPLE_BUNDLE_ID`
3. Host `public/.well-known/apple-app-site-association` with TeamID substituted
4. Add Share Extension target in Xcode from `ios/ShareExtension/` and enable App Group
5. Add `MaNativePlugin.swift` to the App target if not already compiled into the Xcode project

## Google owner setup (`OWNER_REQUIRED`)

1. Firebase / Google Cloud Android app for `il.co.mashachachti.app`
2. Place `android/app/google-services.json` (gitignored)
3. Set `GOOGLE_ANDROID_CLIENT_ID` / `GOOGLE_WEB_CLIENT_ID`
4. Optional server push: `FCM_SERVER_KEY` + `NATIVE_PUSH_ENABLED=true`
5. Publish `assetlinks.json` with release signing cert SHA-256

## Commands that exist

```bash
npm run build:prod   # loads .env.production, refuses QA URL / APP_ENV=qa
npm run build:qa     # loads .env.qa into .next-qa only
npm run typecheck    # also used by npm run lint
npm test
npm run build        # alias of build:prod
npm run cap:sync
npm run android:sync
npm run android:build
npm run ios:sync     # CocoaPods/Xcode required on macOS
```

`npm run build` / `build:prod` always source `.env.production` and abort if a QA Supabase URL (`:8011`) or `APP_ENV=qa` is detected — including leftovers exported in the shell.
## Physical device checklist

- [ ] iOS device: Apple login, APNs permission/token, Share Extension, mic
- [ ] Android device: Google login, FCM token, Share intent, mic, App Link
- [ ] Cold start session restore (Keychain / private prefs)
- [ ] Deep link logged-out → login → resume
- [ ] Push open routes to `/app?...`

## Secure session storage

| Platform | Mechanism |
|----------|-----------|
| **Web/PWA** | Supabase default browser storage (unchanged) |
| **iOS** | Keychain (`kSecClassGenericPassword`) via `MaNativePlugin.secure*` |
| **Android** | `EncryptedSharedPreferences` + `MasterKey` in Android Keystore (`SecureSessionStore`) |

Android never persists access/refresh tokens in plaintext `SharedPreferences`. Legacy `ma_native_secure` plaintext prefs are migrated once into the encrypted store and wiped.
