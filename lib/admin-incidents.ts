import { daysAgoIso } from "./admin-api.ts";
import type {
  AdminIncident,
  AdminIncidentsResponse,
} from "./admin-control-contract.ts";
import { HttpError } from "./server-auth.ts";
import { createServiceClient } from "./supabase-admin.ts";

const WINDOW_DAYS = 7;
const SAMPLE_LIMIT = 1_000;

type EventRow = {
  id: string | number;
  event_type: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

function subsystemFor(eventType: string): AdminIncident["subsystem"] {
  if (eventType.startsWith("ai.")) return "ai";
  if (eventType.startsWith("cron.reminders.")) return "reminders";
  if (eventType.startsWith("push.")) return "push";
  if (eventType.startsWith("auth.")) return "auth";
  if (eventType.startsWith("database.")) return "database";
  return "system";
}

function titleFor(eventType: string) {
  const titles: Record<string, string> = {
    "ai.failure": "כשל בעיבוד AI",
    "cron.reminders.failure": "כשל בריצת תזכורות",
    "cron.recordings.failure": "כשל בניקוי הקלטות",
    "push.test.failure": "כשל בבדיקת Push",
  };
  return titles[eventType] ?? `כשל מערכת: ${eventType}`;
}

function successEventFor(eventType: string) {
  const known: Record<string, string> = {
    "ai.failure": "ai.success",
    "cron.reminders.failure": "cron.reminders.success",
    "cron.recordings.failure": "cron.recordings.success",
    "push.test.failure": "push.test",
  };
  return known[eventType] ?? eventType.replace(/\.failure$/, ".success");
}

function stringMetadata(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

export async function loadAdminIncidents(): Promise<AdminIncidentsResponse> {
  const db = createServiceClient();
  const since = daysAgoIso(WINDOW_DAYS);
  const { data, error } = await db
    .from("activity_events")
    .select("id,event_type,created_at,metadata")
    .like("event_type", "%.failure")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(SAMPLE_LIMIT);
  if (error) throw new HttpError(503, "לא הצלחנו לטעון את התקלות האחרונות.");

  const failures = (data ?? []) as EventRow[];
  const eventTypes = [...new Set(failures.map((row) => row.event_type))];
  const successTypes = [...new Set(eventTypes.map(successEventFor))];
  const { data: successData, error: successError } = successTypes.length
    ? await db
        .from("activity_events")
        .select("id,event_type,created_at,metadata")
        .in("event_type", successTypes)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(SAMPLE_LIMIT)
    : { data: [], error: null };
  if (successError) {
    throw new HttpError(503, "לא הצלחנו לאמת אם התקלות נפתרו.");
  }
  const successes = (successData ?? []) as EventRow[];

  const groups = new Map<string, EventRow[]>();
  for (const row of failures) {
    const current = groups.get(row.event_type) ?? [];
    current.push(row);
    groups.set(row.event_type, current);
  }

  const incidents = [...groups.entries()].map(([eventType, rows]) => {
    const newest = rows[0];
    const oldest = rows[rows.length - 1];
    const expectedSuccess = successEventFor(eventType);
    const resolution = successes.find(
      (row) =>
        row.event_type === expectedSuccess &&
        new Date(row.created_at).getTime() >
          new Date(newest.created_at).getTime(),
    );
    const metadata = newest.metadata ?? {};
    const latestCode = stringMetadata(metadata, "code", "errorCode", "status");
    const latestMessage = stringMetadata(metadata, "message", "error");
    const latency = Number(metadata.latencyMs);
    return {
      id: eventType,
      eventType,
      title: titleFor(eventType),
      subsystem: subsystemFor(eventType),
      severity: "error" as const,
      firstSeen: oldest.created_at,
      lastSeen: newest.created_at,
      occurrenceCount: rows.length,
      latestCode,
      latestMessage,
      latestLatencyMs: Number.isFinite(latency) ? latency : null,
      status: resolution ? ("resolved" as const) : ("unresolved" as const),
      resolutionEvidenceAt: resolution?.created_at ?? null,
    };
  });

  incidents.sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
  );
  return {
    occurrenceCount: failures.length,
    categoryCount: incidents.length,
    unresolvedCount: incidents.filter(
      (incident) => incident.status === "unresolved",
    ).length,
    incidents,
    windowDays: WINDOW_DAYS,
    sampleLimit: SAMPLE_LIMIT,
    sampleTruncated: failures.length === SAMPLE_LIMIT,
    generatedAt: new Date().toISOString(),
  };
}
