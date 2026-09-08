import { createClient } from "@supabase/supabase-js";
import { AGENT_CONTRACT_VERSION } from "@/lib/agent/instructions";
import { APP_SCHEMA_VERSION, CHAT_API_VERSION } from "@/lib/version";

export async function GET() {
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

  let databaseReachable = false;
  let databaseSchemaCompatible = false;
  if (supabaseConfigured) {
    try {
      const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const result = await Promise.race([
        db.from("app_states").select("owner_id").limit(1),
        new Promise<{ data: null; error: { message: string } }>((resolve) =>
          setTimeout(
            () => resolve({ data: null, error: { message: "timeout" } }),
            2500,
          ),
        ),
      ]);
      const errMsg = result.error?.message ?? "";
      if (errMsg === "timeout") {
        databaseReachable = false;
        databaseSchemaCompatible = false;
      } else if (/does not exist|schema cache/i.test(errMsg)) {
        databaseReachable = true;
        databaseSchemaCompatible = false;
      } else {
        // Reachable even when empty / RLS filters rows.
        databaseReachable = true;
        databaseSchemaCompatible = true;
      }
    } catch {
      databaseReachable = false;
      databaseSchemaCompatible = false;
    }
  }

  const databaseReady =
    supabaseConfigured && databaseReachable && databaseSchemaCompatible;
  const ready = missing.length === 0 && databaseReady;
  return Response.json(
    {
      status: ready
        ? "ok"
        : missing.length
          ? "configuration_missing"
          : "degraded",
      version: appVersion,
      appVersion,
      appSchemaVersion: APP_SCHEMA_VERSION,
      chatApiVersion: CHAT_API_VERSION,
      deploymentVersion,
      supabaseConfigured,
      databaseReachable,
      databaseSchemaCompatible,
      databaseReady,
      aiConfigured,
      agentContractVersion: AGENT_CONTRACT_VERSION,
      missing: missing.length ? missing : undefined,
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
