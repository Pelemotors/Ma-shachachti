import { adminDb, ApiError, authorize, fail } from "@/lib/server";

async function admin(req: Request) {
  const { userId } = await authorize(req);
  const db = adminDb();
  const { data } = await db
    .from("user_roles")
    .select("role,approved")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.role !== "admin" || !data.approved)
    throw new ApiError(403, "אין הרשאת מנהל.", "admin_required");
  return db;
}

export async function GET(req: Request) {
  try {
    const db = await admin(req);
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, error } = await db
      .from("activity_events")
      .select("event_type,created_at,metadata")
      .in("event_type", ["ai.success", "ai.failure"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error)
      throw new ApiError(503, "לא ניתן לקרוא נתוני AI.", "admin_ai_read_failed");
    const rows = data ?? [];
    const success = rows.filter((x) => x.event_type === "ai.success");
    const failures = rows.filter((x) => x.event_type === "ai.failure");
    const latencies = success
      .map((x) => Number((x.metadata as { latencyMs?: number })?.latencyMs))
      .filter(Number.isFinite);
    const failureCodes: Record<string, number> = {};
    for (const row of failures) {
      const code = String((row.metadata as { code?: string })?.code ?? "unknown");
      failureCodes[code] = (failureCodes[code] ?? 0) + 1;
    }
    return Response.json({
      attempts: rows.length,
      successes: success.length,
      failures: failures.length,
      successRate: rows.length ? success.length / rows.length : null,
      averageLatencyMs: latencies.length
        ? Math.round(latencies.reduce((n, x) => n + x, 0) / latencies.length)
        : null,
      failureCodes,
      lastTestedAt: rows[0]?.created_at ?? null,
    });
  } catch (e) {
    return fail(e);
  }
}
