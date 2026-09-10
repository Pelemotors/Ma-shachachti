import { authorize, HttpError } from "@/lib/server-auth";
import { loadTasks } from "@/lib/actions";
import { DEFAULT_REMINDER_MINUTES } from "@/lib/reminders";
import { listUpcomingReminders } from "@/lib/upcoming-reminders";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const [tasks, prefs] = await Promise.all([
      loadTasks(db, userId),
      db
        .from("notification_preferences")
        .select("default_reminder_minutes")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    const upcoming = listUpcomingReminders(
      tasks,
      Number.isFinite(Number(prefs.data?.default_reminder_minutes))
        ? Number(prefs.data?.default_reminder_minutes)
        : DEFAULT_REMINDER_MINUTES,
    );
    return Response.json({ upcoming });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "לא הצלחנו לטעון התראות בדרך." },
      { status: 500 },
    );
  }
}
