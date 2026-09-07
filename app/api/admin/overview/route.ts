import { adminDb, ApiError, authorize, fail } from "@/lib/server";

async function dbFor(req: Request) {
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
    const db = await dbFor(req);
    const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
    const users = [];
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await db.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error)
        throw new ApiError(
          503,
          "קריאת משתמשים נכשלה.",
          "admin_users_read_failed",
        );
      users.push(...data.users);
      if (data.users.length < 200) break;
    }

    const [roles, states, events, reminders] = await Promise.all([
      db.from("user_roles").select("user_id,role,approved"),
      db.from("app_states").select("owner_id,data,updated_at"),
      db
        .from("activity_events")
        .select("event_type,owner_id,created_at,metadata")
        .gte("created_at", since7)
        .order("created_at", { ascending: false })
        .limit(5000),
      db
        .from("reminder_queue")
        .select("status,attempts,last_error,due_at,delivered_at")
        .gte("due_at", since7),
    ]);
    if (roles.error || states.error || events.error || reminders.error)
      throw new ApiError(
        503,
        "קריאת נתוני הניהול נכשלה.",
        "admin_metrics_read_failed",
      );

    const rr = roles.data ?? [],
      ss = states.data ?? [],
      ee = events.data ?? [],
      rm = reminders.data ?? [];
    const approved = rr.filter((x) => x.approved).length,
      pending = rr.filter((x) => !x.approved).length,
      active7 = new Set([
        ...users
          .filter((x) => x.last_sign_in_at && x.last_sign_in_at >= since7)
          .map((x) => x.id),
        ...ss.filter((x) => x.updated_at >= since7).map((x) => x.owner_id),
      ]).size;

    let taskCount = 0,
      completed = 0;
    for (const s of ss) {
      const d = s.data as {
        tasks?: Array<{ status?: string; completed?: boolean }>;
      };
      const tasks = Array.isArray(d?.tasks) ? d.tasks : [];
      taskCount += tasks.length;
      completed += tasks.filter(
        (t) => t.completed || t.status === "done" || t.status === "completed",
      ).length;
    }

    const aiSuccess = ee.filter((e) => e.event_type === "ai.success"),
      aiFailure = ee.filter((e) => e.event_type === "ai.failure"),
      aiLatencies = aiSuccess
        .map((e) => Number((e.metadata as { latencyMs?: number })?.latencyMs))
        .filter(Number.isFinite),
      aiAverageLatencyMs = aiLatencies.length
        ? Math.round(
            aiLatencies.reduce((n, x) => n + x, 0) / aiLatencies.length,
          )
        : null;

    const byDay: Record<
      string,
      { date: string; events: number; ai: number; aiFailures: number }
    > = {};
    for (let i = 6; i >= 0; i--) {
      const k = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      byDay[k] = { date: k, events: 0, ai: 0, aiFailures: 0 };
    }
    for (const e of ee) {
      const k = e.created_at.slice(0, 10);
      if (!byDay[k]) continue;
      byDay[k].events++;
      if (e.event_type === "ai.success") byDay[k].ai++;
      if (e.event_type === "ai.failure") byDay[k].aiFailures++;
    }

    return Response.json({
      stats: {
        users: users.length,
        approved,
        pending,
        active7,
        tasks: taskCount,
        completed,
        ai7: aiSuccess.length,
        aiAttempts7: aiSuccess.length + aiFailure.length,
        aiFailures7: aiFailure.length,
        aiAverageLatencyMs,
        reminders7: rm.length,
        reminderErrors: rm.filter((x) => x.last_error).length,
      },
      series: Object.values(byDay),
      recent: ee.slice(0, 50),
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return fail(e);
  }
}
