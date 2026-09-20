import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./server-auth.ts";
import {
  calendarEncryptionReady,
  decryptTokenEnvelope,
  encryptTokenEnvelope,
} from "./crypto/token-envelope.ts";

export function calendarOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
      calendarEncryptionReady(),
  );
}

export function nativeOAuthConfigured() {
  return {
    google: Boolean(process.env.GOOGLE_NATIVE_CLIENT_ID),
    apple: Boolean(process.env.APPLE_NATIVE_CLIENT_ID || process.env.APPLE_CLIENT_ID),
    calendar: calendarOAuthConfigured(),
  };
}

export async function storeCalendarTokens(
  admin: SupabaseClient,
  userId: string,
  tokens: { access_token: string; refresh_token?: string; scopes?: string },
) {
  if (!calendarEncryptionReady()) {
    throw new HttpError(503, "חיבור היומן אינו מוגדר.");
  }
  const envelope = encryptTokenEnvelope(JSON.stringify(tokens));
  const { error } = await admin.from("calendar_connections").upsert(
    {
      user_id: userId,
      provider: "google",
      ...envelope,
      scopes: tokens.scopes ?? "calendar.readonly",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new HttpError(503, "שמירת חיבור היומן נכשלה.");
}

export async function readCalendarTokens(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("calendar_connections")
    .select("token_ciphertext,token_iv,token_tag")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new HttpError(503, "טעינת חיבור היומן נכשלה.");
  if (!data) return null;
  const json = decryptTokenEnvelope(data);
  return JSON.parse(json) as { access_token: string; refresh_token?: string };
}

export async function disconnectCalendar(admin: SupabaseClient, userId: string) {
  const tokens = await readCalendarTokens(admin, userId).catch(() => null);
  if (tokens?.access_token) {
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.access_token)}`,
      { method: "POST" },
    ).catch(() => null);
  }
  await admin.from("calendar_events_cache").delete().eq("user_id", userId);
  await admin.from("calendar_connections").delete().eq("user_id", userId);
}

export async function loadCalendarConstraints(
  db: SupabaseClient,
  userId: string,
  fromIso: string,
  toIso: string,
) {
  const { data, error } = await db
    .from("calendar_events_cache")
    .select("title,start_at,end_at")
    .eq("user_id", userId)
    .lt("start_at", toIso)
    .gt("end_at", fromIso);
  if (error) throw new HttpError(503, "טעינת אירועי היומן נכשלה.");
  return data ?? [];
}

export function mapGoogleEvent(event: {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}) {
  if (!event.id) return null;
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  if (!start || !end) return null;
  return {
    provider_event_id: event.id,
    title: (event.summary || "אירוע ביומן").slice(0, 200),
    start_at: new Date(start).toISOString(),
    end_at: new Date(end).toISOString(),
  };
}
