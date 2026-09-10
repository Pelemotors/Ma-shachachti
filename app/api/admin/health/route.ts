import { authorizeAdmin } from "@/lib/server-auth";
import { adminJsonError } from "@/lib/admin-api";
import { vapidConfigured } from "@/lib/push";
import { createServiceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await authorizeAdmin(req);
    const started = Date.now();
    let database: "healthy" | "error" = "error";
    try {
      const admin = createServiceClient();
      const { error } = await admin.from("user_roles").select("user_id").limit(1);
      if (!error) database = "healthy";
    } catch {
      database = "error";
    }
    const latencyMs = Date.now() - started;
    const admin = database === "healthy" ? createServiceClient() : null;
    const { data: lastAi } = admin
      ? await admin
          .from("activity_events")
          .select("event_type,created_at,metadata")
          .in("event_type", ["ai.success", "ai.failure"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };
    const { data: lastCron } = admin
      ? await admin
          .from("activity_events")
          .select("event_type,created_at")
          .in("event_type", ["cron.reminders.success", "cron.reminders.failure"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    const openaiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
    const cronConfigured = Boolean(process.env.CRON_SECRET?.trim());
    const openaiStatus = !openaiConfigured
      ? "not_configured"
      : lastAi?.event_type === "ai.failure"
        ? "failed"
        : lastAi?.event_type === "ai.success"
          ? "available"
          : "unknown";
    const cronStatus = !cronConfigured
      ? "not_configured"
      : lastCron?.event_type === "cron.reminders.failure"
        ? "failed"
        : lastCron?.event_type === "cron.reminders.success"
          ? "available"
          : "unknown";

    return Response.json({
      database,
      latencyMs,
      services: {
        supabase: database === "healthy",
        openai: openaiStatus === "available",
        push: vapidConfigured(),
        cron: cronStatus === "available",
      },
      serviceDetails: {
        supabase: {
          configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
          status: database === "healthy" ? "available" : "failed",
        },
        openai: {
          configured: openaiConfigured,
          status: openaiStatus,
          lastTestedAt: lastAi?.created_at ?? null,
          lastFailureCode:
            lastAi?.event_type === "ai.failure"
              ? ((lastAi.metadata as { code?: string } | null)?.code ?? null)
              : null,
        },
        push: {
          configured: vapidConfigured(),
          status: vapidConfigured() ? "configured" : "not_configured",
        },
        cron: {
          configured: cronConfigured,
          status: cronStatus,
          lastRunAt: lastCron?.created_at ?? null,
        },
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return adminJsonError(error);
  }
}
