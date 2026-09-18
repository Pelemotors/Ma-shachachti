# מה שכחתי? — Mobile (Android-first)

Expo + React Native **Development Build** (לא Expo Go).

## Package
- Android `applicationId` / iOS bundle: `com.mashachachti.app`

## Env
Copy `.env.example` → `.env`:
- `MOBILE_API_BASE_URL` — same Next API (e.g. `https://mashachachti.co.il`)
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — for session after `/api/auth/native`

## Scripts
```bash
npm start          # expo start --dev-client
npm run android    # expo run:android
npm run prebuild:android
cd android && ./gradlew assembleDebug
```

## Architecture
- Screens → `src/api/*` only (no raw fetch)
- Auth: native identity → `POST /api/auth/native` → `verifyOtp(hashedToken)` → Secure Store
- No WebView; no separate mobile Source of Truth
