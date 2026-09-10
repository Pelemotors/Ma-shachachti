import { authorizeAdmin, HttpError } from "@/lib/server-auth";
import { adminJsonError, daysAgoIso, localDayKey } from "@/lib/admin-api";
import { createServiceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await authorizeAdmin(req);
    const admin = createServiceClient();
    const since = daysAgoIso(7);

    const [
      roles,
      tasks,
      events,
      authUsers,
    ] = await Promise.all([
      admin.from("user_roles").select("user_id,approved,role"),
      admin.from("tasks").select("user_id,status,updated_at,reminder_sent_at"),
      admin
        .from("activity_events")
        .select("event_type,created_at,owner_id,metadata")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
      admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    ]);
    if (roles.error || tasks.error || events.error) {
      throw new HttpError(503, "לא הצלחנו לטעון את הסקירה.");
    }

    const roleRows = roles.data ?? [];
    const taskRows = tasks.data ?? [];
    const eventRows = events.data ?? [];
    const signIns = new Set(
      (authUsers.data?.users ?? [])
        .filter((user) => user.last_sign_in_at && user.last_sign_in_at >= since)
        .map((user) => user.id),
    );
    for (const row of eventRows) {
      if (row.owner_id) signIns.add(row.owner_id as string);
    }
    for (const row of taskRows) {
      if (row.user_id && (row.updated_at as string) >= since) {
        signIns.add(row.user_id as string);
      }
    }

    const aiEvents = eventRows.filter((row) =>
      String(row.event_type).startsWith("ai."),
    );
    const aiSuccess = aiEvents.filter((row) => row.event_type === "ai.success");
    const aiFailure = aiEvents.filter((row) => row.event_type === "ai.failure");
    const latencies = aiSuccess
      .map((row) => Number((row.metadata as { latencyMs?: number } | null)?.latencyMs))
      .filter((value) => Number.isFinite(value));
    const reminderSent = taskRows.filter(
      (row) =>
        row.reminder_sent_at && String(row.reminder_sent_at) >= since,
    ).length;
    const reminderErrors = eventRows.filter(
      (row) => row.event_type === "cron.reminders.failure",
    ).length;

    const seriesMap = new Map<string, { events: number; ai: number; aiFailures: number }>();
    for (let i = 6; i >= 0; i -= 1) {
      const day = localDayKey(daysAgoIso(i));
      seriesMap.set(day, { events: 0, ai: 0, aiFailures: 0 });
    }
    for (const row of eventRows) {
      const day = localDayKey(row.created_at as string);
      const current = seriesMap.get(day);
      if (!current) continue;
      current.events += 1;
      if (row.event_type === "ai.success") current.ai += 1;
      if (row.event_type === "ai.failure") current.aiFailures += 1;
    }

    return Response.json({
      stats: {
        users: roleRows.length,
        approved: roleRows.filter((row) => row.approved).length,
        pending: roleRows.filter((row) => !row.approved).length,
        active7: signIns.size,
        tasks: taskRows.length,
        completed: taskRows.filter((row) => row.status === "done").length,
        ai7: aiSuccess.length,
        aiAttempts7: aiEvents.length,
        aiFailures7: aiFailure.length,
        aiAverageLatencyMs: latencies.length
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : null,
        reminders7: reminderSent,
        reminderErrors,
      },
      series: [...seriesMap.entries()].map(([date, value]) => ({
        date,
        ...value,
      })),
      recent: eventRows.slice(0, 12),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return adminJsonError(error);
  }
}
