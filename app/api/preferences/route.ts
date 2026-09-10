import { authorize, HttpError } from "@/lib/server-auth";
import {
  DEFAULT_REMINDER_MINUTES,
  isReminderMinuteOption,
} from "@/lib/reminders";

export const runtime = "nodejs";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Lean preferences error");
  return Response.json({ error: "לא הצלחנו לשמור את ההגדרה." }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const { data, error } = await db
      .from("notification_preferences")
      .select("default_reminder_minutes")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new HttpError(503, "לא הצלחנו לטעון את ההגדרות.");
    return Response.json({
      default_reminder_minutes:
        data?.default_reminder_minutes ?? DEFAULT_REMINDER_MINUTES,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = (await req.json().catch(() => null)) as {
      default_reminder_minutes?: unknown;
    } | null;
    if (!isReminderMinuteOption(body?.default_reminder_minutes)) {
      throw new HttpError(400, "זמן התזכורת אינו תקין.");
    }
    const now = new Date().toISOString();
    const { error } = await db.from("notification_preferences").upsert({
      user_id: userId,
      default_reminder_minutes: body.default_reminder_minutes,
      updated_at: now,
    });
    if (error) throw new HttpError(503, "לא הצלחנו לשמור את ההגדרה.");
    return Response.json({
      default_reminder_minutes: body.default_reminder_minutes,
    });
  } catch (error) {
    return jsonError(error);
  }
}
