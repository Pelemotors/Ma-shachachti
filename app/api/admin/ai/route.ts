import { authorizeAdmin, HttpError } from "@/lib/server-auth";
import { adminJsonError, daysAgoIso } from "@/lib/admin-api";
import { createServiceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await authorizeAdmin(req);
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("activity_events")
      .select("event_type,created_at,metadata")
      .in("event_type", ["ai.success", "ai.failure"])
      .gte("created_at", daysAgoIso(30))
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new HttpError(503, "לא הצלחנו לטעון מדדי AI.");
    const rows = data ?? [];
    const successes = rows.filter((row) => row.event_type === "ai.success");
    const failures = rows.filter((row) => row.event_type === "ai.failure");
    const latencies = successes
      .map((row) => Number((row.metadata as { latencyMs?: number } | null)?.latencyMs))
      .filter((value) => Number.isFinite(value));
    const failureCodes: Record<string, number> = {};
    for (const row of failures) {
      const code =
        String((row.metadata as { code?: string } | null)?.code ?? "unknown");
      failureCodes[code] = (failureCodes[code] ?? 0) + 1;
    }
    return Response.json({
      attempts: rows.length,
      successes: successes.length,
      failures: failures.length,
      successRate: rows.length
        ? Math.round((successes.length / rows.length) * 100)
        : null,
      averageLatencyMs: latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null,
      failureCodes,
      lastTestedAt: rows[0]?.created_at ?? null,
    });
  } catch (error) {
    return adminJsonError(error);
  }
}
