import { authorize, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase-admin";
import {
  CalendarReconnectError,
  assertServerOwnedCalendarBody,
  calendarOAuthConfigured,
  disconnectCalendar,
  nativeOAuthConfigured,
  syncGoogleCalendar,
} from "@/lib/calendar";

export const runtime = "nodejs";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "פעולת היומן נכשלה." }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const configured = nativeOAuthConfigured();
    const admin = createServiceClient();
    const { data: connection } = await admin
      .from("calendar_connections")
      .select("provider,updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: events } = await db
      .from("calendar_events_cache")
      .select("provider_event_id,title,start_at,end_at,calendar_ref")
      .eq("user_id", userId)
      .order("start_at")
      .limit(100);
    return Response.json({
      configured: configured.calendar,
      connected: Boolean(connection),
      events: events ?? [],
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await authorize(req);
    const body = (await req.json()) as {
      action?: string;
      access_token?: string;
      refresh_token?: string;
      events?: unknown[];
    };
    assertServerOwnedCalendarBody(body);
    if (!calendarOAuthConfigured() && body.action !== "disconnect") {
      throw new HttpError(503, "חיבור היומן אינו מוגדר בסביבה זו.");
    }
    const admin = createServiceClient();
    if (body.action === "disconnect") {
      await disconnectCalendar(admin, userId);
      return Response.json({ ok: true, connected: false });
    }
    if (body.action === "sync") {
      const result = await syncGoogleCalendar(admin, userId);
      return Response.json({ ok: true, connected: true, stored: result.stored });
    }
    throw new HttpError(400, "פעולה לא מוכרת.");
  } catch (error) {
    if (error instanceof CalendarReconnectError) {
      return Response.json({ error: error.message, reconnectRequired: true }, { status: 409 });
    }
    return jsonError(error);
  }
}
