import { authorize, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase-admin";
import {
  calendarOAuthConfigured,
  disconnectCalendar,
  mapGoogleEvent,
  nativeOAuthConfigured,
  storeCalendarTokens,
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
    const { data: connection } = await db
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
    if (!calendarOAuthConfigured() && body.action !== "disconnect") {
      throw new HttpError(503, "חיבור היומן אינו מוגדר בסביבה זו.");
    }
    const admin = createServiceClient();
    if (body.action === "disconnect") {
      await disconnectCalendar(admin, userId);
      return Response.json({ ok: true, connected: false });
    }
    if (body.action === "connect") {
      if (!body.access_token) throw new HttpError(400, "חסר אסימון.");
      await storeCalendarTokens(admin, userId, {
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      return Response.json({ ok: true, connected: true });
    }
    if (body.action === "sync") {
      const mapped = (body.events ?? [])
        .map((event) => mapGoogleEvent(event as never))
        .filter(Boolean);
      await admin.from("calendar_events_cache").delete().eq("user_id", userId);
      if (mapped.length) {
        await admin.from("calendar_events_cache").insert(
          mapped.map((event) => ({
            user_id: userId,
            provider: "google",
            ...event,
          })),
        );
      }
      return Response.json({ ok: true, stored: mapped.length });
    }
    throw new HttpError(400, "פעולה לא מוכרת.");
  } catch (error) {
    return jsonError(error);
  }
}
