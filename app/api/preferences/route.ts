import { authorize, HttpError } from "@/lib/server-auth";
import {
  DEFAULT_REMINDER_MINUTES,
  isReminderMinuteOption,
} from "@/lib/reminders";
import { NOTIFICATION_KINDS } from "@/lib/auth/identity";

export const runtime = "nodejs";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Lean preferences error");
  return Response.json({ error: "לא הצלחנו לשמור את ההגדרה." }, { status: 500 });
}

function normalizeKinds(value: unknown): Record<string, boolean> | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "העדפות סוגי התראה אינן תקינות.");
  }
  const out: Record<string, boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!(NOTIFICATION_KINDS as readonly string[]).includes(key)) {
      throw new HttpError(400, "סוג התראה אינו נתמך.");
    }
    if (typeof raw !== "boolean") {
      throw new HttpError(400, "ערך העדפת התראה חייב להיות בוליאני.");
    }
    out[key] = raw;
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const { data, error } = await db
      .from("notification_preferences")
      .select("default_reminder_minutes,kinds")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new HttpError(503, "לא הצלחנו לטעון את ההגדרות.");
    return Response.json({
      default_reminder_minutes:
        data?.default_reminder_minutes ?? DEFAULT_REMINDER_MINUTES,
      kinds: (data?.kinds as Record<string, boolean> | null) ?? {},
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
      kinds?: unknown;
    } | null;
    if (!isReminderMinuteOption(body?.default_reminder_minutes)) {
      throw new HttpError(400, "זמן התזכורת אינו תקין.");
    }
    const kinds = normalizeKinds(body?.kinds);
    const now = new Date().toISOString();
    const row: Record<string, unknown> = {
      user_id: userId,
      default_reminder_minutes: body.default_reminder_minutes,
      updated_at: now,
    };
    if (kinds) row.kinds = kinds;
    const { error } = await db.from("notification_preferences").upsert(row);
    if (error) throw new HttpError(503, "לא הצלחנו לשמור את ההגדרה.");
    return Response.json({
      default_reminder_minutes: body.default_reminder_minutes,
      kinds: kinds ?? {},
    });
  } catch (error) {
    return jsonError(error);
  }
}
