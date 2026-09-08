import { AGENT_CONTRACT_VERSION } from "@/lib/agent/instructions";

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
  const missing = required.filter((key) => !process.env[key]);
  const deploymentVersion =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.DEPLOYMENT_VERSION ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "dev";
  const appVersion = process.env.npm_package_version || "0.1.0";
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const aiConfigured = Boolean(
    process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL,
  );
  const ready = missing.length === 0;
  return Response.json(
    {
      status: ready ? "ok" : "configuration_missing",
      version: appVersion,
      appVersion,
      deploymentVersion,
      supabaseConfigured,
      aiConfigured,
      agentContractVersion: AGENT_CONTRACT_VERSION,
      missing: ready ? undefined : missing,
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
