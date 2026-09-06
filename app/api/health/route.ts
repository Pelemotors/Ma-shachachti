export function GET() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "OPENAI_TRANSCRIPTION_MODEL",
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
    "CRON_SECRET",
  ] as const;
  const env = Object.fromEntries(required.map((key) => [key, Boolean(process.env[key])]));
  const ready = Object.values(env).every(Boolean);
  return Response.json(
    { status: ready ? "ok" : "configuration_missing", version: "0.1.0", env },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
