import { authorizeAdmin, HttpError } from "@/lib/server-auth";
import { adminJsonError, daysAgoIso } from "@/lib/admin-api";
import { createServiceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return Math.round(sorted[lower]);
  return Math.round(
    sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower),
  );
}

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
      .map((row) =>
        Number((row.metadata as { latencyMs?: number } | null)?.latencyMs),
      )
      .filter((value) => Number.isFinite(value));
    const failureCodes: Record<string, number> = {};
    for (const row of failures) {
      const code = String(
        (row.metadata as { code?: string } | null)?.code ?? "unknown",
      );
      failureCodes[code] = (failureCodes[code] ?? 0) + 1;
    }
    const retryMetadata = successes
      .map((row) =>
        Number((row.metadata as { attempts?: number } | null)?.attempts),
      )
      .filter((value) => Number.isInteger(value) && value > 0);
    const models = [
      ...new Set(
        rows
          .map((row) =>
            String((row.metadata as { model?: string } | null)?.model ?? ""),
          )
          .filter(Boolean),
      ),
    ];
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
      medianLatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: latencies.length >= 20 ? percentile(latencies, 0.95) : null,
      latencySampleCount: latencies.length,
      successfulCallsWithRetry: retryMetadata.filter((value) => value > 1)
        .length,
      retryMetadataSampleCount: retryMetadata.length,
      failureCodes,
      recentFailures: failures.slice(0, 12).map((row) => {
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        return {
          createdAt: row.created_at,
          code: String(metadata.code ?? metadata.errorCode ?? "unknown"),
          status: Number.isFinite(Number(metadata.status))
            ? Number(metadata.status)
            : null,
          latencyMs: Number.isFinite(Number(metadata.latencyMs))
            ? Number(metadata.latencyMs)
            : null,
          message:
            typeof metadata.message === "string"
              ? metadata.message
              : typeof metadata.error === "string"
                ? metadata.error
                : null,
          model: typeof metadata.model === "string" ? metadata.model : null,
        };
      }),
      models,
      lastTestedAt: rows[0]?.created_at ?? null,
      lastSuccessAt: successes[0]?.created_at ?? null,
      lastFailureAt: failures[0]?.created_at ?? null,
      windowDays: 30,
      sampleLimit: 500,
      sampleTruncated: rows.length === 500,
      latencyScope: "application_decision_preparation",
    });
  } catch (error) {
    return adminJsonError(error);
  }
}
