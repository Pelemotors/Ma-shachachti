# Data processors — Release audit

Production host: self-hosted Supabase on VPS. Play declaration: **Shared = No** (service-provider exception).

| Provider | Purpose | Data received | Server/client | Required | Retention knowledge | Policy disclosure | Evidence | Shared=No legal |
|---|---|---|---|---|---|---|---|---|
| Self-hosted Supabase | Auth, DB, Storage | All durable product data | Server | Required | Until delete / audio 7d | Yes | VPS `supabase-*` + `https://supabase.mashachachti.co.il` | Operator-controlled |
| OpenAI | Agent + STT | prompts/context, audio for STT | Server | Required for agent/voice | OpenAI policy | Yes | `lib/agent/openai-orchestrator.ts`, `lib/audio/transcription-service.ts` | **HUMAN RELEASE CHECK** |
| Resend | Auth email | email, magic/reset links | Server (Auth SMTP) | Required for email auth | Resend policy | Yes | `docs/EMAIL_AUTH_RESEND.md` | **HUMAN RELEASE CHECK** |
| FCM / APNs / Web Push | Notification delivery | push token + generic payload | Server after opt-in | Optional | provider token lifecycle | Yes | `lib/notifications/native-delivery.ts` | **HUMAN RELEASE CHECK** |
| Google OAuth (Sign-In / Calendar) | Identity / calendar | id token; calendar metadata if connected | Server + native | Optional | Google account policy | Yes | `/api/auth/native`, `/api/calendar` | **HUMAN RELEASE CHECK** |
| Apple OAuth | Identity | identity token | Server + browser/native | Optional | Apple policy | Yes | `/api/auth/native` | **HUMAN RELEASE CHECK** |

Do not treat Shared=No as a code PASS. It is a contractual HUMAN RELEASE CHECK.
