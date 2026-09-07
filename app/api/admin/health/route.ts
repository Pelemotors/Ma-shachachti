import { adminDb, ApiError, authorize, fail } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { userId } = await authorize(req);
    const db = adminDb();
    const { data: role } = await db
      .from("user_roles")
      .select("role,approved")
      .eq("user_id", userId)
      .maybeSingle();
    if (role?.role !== "admin" || !role.approved)
      throw new ApiError(403, "אין הרשאת מנהל.", "admin_required");

    const start = Date.now();
    const [database, recent] = await Promise.all([
      db.from("app_states").select("owner_id", { head: true, count: "exact" }),
      db
        .from("activity_events")
        .select("event_type,created_at,metadata")
        .in("event_type", [
          "ai.success",
          "ai.failure",
          "cron.reminders.success",
          "cron.reminders.failure",
        ])
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const events = recent.data ?? [];
    const latestAi = events.find((e) => e.event_type.startsWith("ai."));
    const latestCron = events.find((e) => e.event_type.startsWith("cron.reminders."));
    const openaiConfigured = Boolean(
      process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL,
    );
    const pushConfigured = Boolean(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
        process.env.VAPID_PRIVATE_KEY &&
        process.env.VAPID_SUBJECT,
    );

    return Response.json({
      database: database.error ? "error" : "healthy",
      latencyMs: Date.now() - start,
      services: {
        supabase: {
          configured: Boolean(
            process.env.NEXT_PUBLIC_SUPABASE_URL &&
              process.env.SUPABASE_SERVICE_ROLE_KEY,
          ),
          status: database.error ? "failed" : "available",
        },
        openai: {
          configured: openaiConfigured,
          status: !openaiConfigured
            ? "not_configured"
            : latestAi?.event_type === "ai.success"
              ? "available"
              : latestAi?.event_type === "ai.failure"
                ? "failed"
                : "unknown",
          lastTestedAt: latestAi?.created_at ?? null,
          lastFailureCode:
            latestAi?.event_type === "ai.failure"
              ? latestAi.metadata?.code ?? "unknown"
              : null,
        },
        push: {
          configured: pushConfigured,
          status: pushConfigured ? "configured" : "not_configured",
        },
        cron: {
          configured: Boolean(process.env.CRON_SECRET),
          status:
            latestCron?.event_type === "cron.reminders.success"
              ? "available"
              : latestCron?.event_type === "cron.reminders.failure"
                ? "failed"
                : "unknown",
          lastRunAt: latestCron?.created_at ?? null,
        },
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    return fail(e);
  }
}
