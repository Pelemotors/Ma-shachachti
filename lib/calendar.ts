import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { productNow } from "./product-clock-server.ts";
import { HttpError } from "./server-auth.ts";
import {
  calendarEncryptionReady,
  decryptTokenEnvelope,
  encryptTokenEnvelope,
} from "./crypto/token-envelope.ts";
import { googleSignInWebClientId } from "./auth/verify-jwt.ts";

export const CALENDAR_EVENTS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";
export const PRODUCTION_CALENDAR_REDIRECT_URI =
  "https://mashachachti.co.il/api/calendar/oauth/callback";
export const CALENDAR_SYNC_LOOKBACK_DAYS = 7;
export const CALENDAR_SYNC_FORWARD_MONTHS = 3;
export const CALENDAR_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const CALENDAR_TOKEN_REFRESH_SKEW_MS = 60_000;

export class CalendarReconnectError extends HttpError {
  constructor(message = "נדרש חיבור מחדש ליומן.") {
    super(409, message);
    this.name = "CalendarReconnectError";
  }
}

export type CalendarTokenEnvelope = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scopes?: string;
};

export function assertServerOwnedCalendarBody(body: {
  access_token?: unknown;
  refresh_token?: unknown;
  events?: unknown;
}) {
  if (body.access_token || body.refresh_token || body.events) {
    throw new HttpError(
      400,
      "השרת הוא הבעלים של סנכרון היומן. אין לשלוח אסימונים או אירועים מהמכשיר.",
    );
  }
}

export function calendarOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() &&
      calendarEncryptionReady(),
  );
}

export function calendarRedirectUri() {
  return process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() || PRODUCTION_CALENDAR_REDIRECT_URI;
}

export function nativeOAuthConfigured() {
  return {
    google: Boolean(
      process.env.GOOGLE_ANDROID_CLIENT_ID?.trim() || googleSignInWebClientId(),
    ),
    apple: Boolean(process.env.APPLE_CLIENT_ID || process.env.APPLE_BUNDLE_ID),
    calendar: calendarOAuthConfigured(),
  };
}

export function hashOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export function evaluateOAuthStateRow(
  row: { user_id: string; expires_at: string } | null,
  nowMs = Date.now(),
): { ok: true; userId: string } | { ok: false; reason: "unknown" | "expired" } {
  if (!row) return { ok: false, reason: "unknown" };
  if (Date.parse(row.expires_at) <= nowMs) return { ok: false, reason: "expired" };
  return { ok: true, userId: row.user_id };
}

export function googleAuthorizationUrl(state: string) {
  if (!calendarOAuthConfigured()) {
    throw new HttpError(503, "חיבור היומן אינו מוגדר.");
  }
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!.trim(),
    redirect_uri: calendarRedirectUri(),
    scope: CALENDAR_EVENTS_READONLY_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function createCalendarOAuthState(admin: SupabaseClient, userId: string) {
  const state = randomBytes(32).toString("base64url");
  const { error } = await admin.from("calendar_oauth_states").insert({
    user_id: userId,
    state_hash: hashOAuthState(state),
    expires_at: new Date(Date.now() + CALENDAR_OAUTH_STATE_TTL_MS).toISOString(),
  });
  if (error) throw new HttpError(503, "פתיחת חיבור היומן נכשלה.");
  return state;
}

export async function claimCalendarOAuthState(admin: SupabaseClient, state: string) {
  const stateHash = hashOAuthState(state);
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("calendar_oauth_states")
    .delete()
    .eq("state_hash", stateHash)
    .gt("expires_at", nowIso)
    .select("user_id,expires_at")
    .maybeSingle();
  if (error) throw new HttpError(503, "אימות חיבור היומן נכשל.");
  const evaluated = evaluateOAuthStateRow(data);
  if (!evaluated.ok) {
    await admin.from("calendar_oauth_states").delete().eq("state_hash", stateHash);
    return evaluated;
  }
  return evaluated;
}

export function calendarAppRedirect(status: "success" | "cancelled" | "error") {
  return `mashachachti://calendar/oauth-complete?status=${status}`;
}

export async function storeCalendarTokens(
  admin: SupabaseClient,
  userId: string,
  tokens: CalendarTokenEnvelope,
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
      scopes: tokens.scopes ?? CALENDAR_EVENTS_READONLY_SCOPE,
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
  return JSON.parse(json) as CalendarTokenEnvelope;
}

async function revokeGoogleToken(token: string) {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `token=${encodeURIComponent(token)}`,
  }).catch(() => null);
}

export async function disconnectCalendar(admin: SupabaseClient, userId: string) {
  const tokens = await readCalendarTokens(admin, userId).catch(() => null);
  if (tokens?.refresh_token) await revokeGoogleToken(tokens.refresh_token);
  else if (tokens?.access_token) await revokeGoogleToken(tokens.access_token);
  await admin.from("calendar_events_cache").delete().eq("user_id", userId);
  await admin.from("calendar_connections").delete().eq("user_id", userId);
}

export type TokenExchangeResult = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
};

export function mergeCalendarTokens(
  previous: CalendarTokenEnvelope | null,
  incoming: TokenExchangeResult,
): CalendarTokenEnvelope {
  const expiresAt =
    typeof incoming.expires_in === "number"
      ? Date.now() + incoming.expires_in * 1000
      : Date.now() + 45 * 60 * 1000;
  return {
    access_token: incoming.access_token,
    refresh_token: incoming.refresh_token || previous?.refresh_token,
    expires_at: expiresAt,
    scopes: incoming.scope || previous?.scopes || CALENDAR_EVENTS_READONLY_SCOPE,
  };
}

export async function exchangeGoogleCalendarCode(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CalendarTokenEnvelope> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!.trim(),
    client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!.trim(),
    redirect_uri: calendarRedirectUri(),
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as TokenExchangeResult;
  if (!response.ok || !json.access_token) {
    throw new HttpError(502, "החלפת אסימון היומן נכשלה.");
  }
  return mergeCalendarTokens(null, json);
}

export async function refreshGoogleCalendarAccessToken(
  tokens: CalendarTokenEnvelope,
  fetchImpl: typeof fetch = fetch,
): Promise<CalendarTokenEnvelope> {
  if (!tokens.refresh_token) throw new CalendarReconnectError();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!.trim(),
    client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!.trim(),
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as TokenExchangeResult;
  if (json.error === "invalid_grant" || response.status === 400) {
    throw new CalendarReconnectError();
  }
  if (!response.ok || !json.access_token) {
    throw new HttpError(502, "חידוש אסימון היומן נכשל.");
  }
  return mergeCalendarTokens(tokens, json);
}

export async function getValidCalendarAccessToken(
  admin: SupabaseClient,
  userId: string,
  fetchImpl: typeof fetch = fetch,
) {
  const tokens = await readCalendarTokens(admin, userId);
  if (!tokens?.access_token) throw new CalendarReconnectError();
  const stillValid =
    typeof tokens.expires_at === "number" &&
    tokens.expires_at - CALENDAR_TOKEN_REFRESH_SKEW_MS > Date.now();
  if (stillValid) return tokens.access_token;
  const refreshed = await refreshGoogleCalendarAccessToken(tokens, fetchImpl);
  await storeCalendarTokens(admin, userId, refreshed);
  return refreshed.access_token;
}

export function calendarSyncWindow(now = productNow()) {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - CALENDAR_SYNC_LOOKBACK_DAYS);
  const to = new Date(now);
  to.setUTCMonth(to.getUTCMonth() + CALENDAR_SYNC_FORWARD_MONTHS);
  return { timeMin: from.toISOString(), timeMax: to.toISOString() };
}

export function mapGoogleEvent(event: {
  id?: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}) {
  if (!event.id || event.status === "cancelled") return null;
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  if (!start || !end) return null;
  const startAt = event.start?.date
    ? new Date(`${event.start.date}T00:00:00.000Z`).toISOString()
    : new Date(start).toISOString();
  const endAt = event.end?.date
    ? new Date(`${event.end.date}T00:00:00.000Z`).toISOString()
    : new Date(end).toISOString();
  return {
    provider_event_id: event.id,
    title: (event.summary || "אירוע ביומן").slice(0, 200),
    start_at: startAt,
    end_at: endAt,
    calendar_ref: "primary",
  };
}

export async function fetchPrimaryCalendarEvents(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
) {
  const { timeMin, timeMax } = calendarSyncWindow();
  const events: Array<Parameters<typeof mapGoogleEvent>[0]> = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) throw new CalendarReconnectError();
    if (!response.ok) throw new HttpError(502, "סנכרון היומן נכשל.");
    const json = (await response.json()) as {
      items?: Array<Parameters<typeof mapGoogleEvent>[0]>;
      nextPageToken?: string;
    };
    events.push(...(json.items ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return events;
}

export async function syncGoogleCalendar(admin: SupabaseClient, userId: string) {
  const accessToken = await getValidCalendarAccessToken(admin, userId);
  const raw = await fetchPrimaryCalendarEvents(accessToken);
  const mapped = raw.map(mapGoogleEvent).filter((row): row is NonNullable<typeof row> => Boolean(row));
  await admin.from("calendar_events_cache").delete().eq("user_id", userId);
  if (mapped.length) {
    const { error } = await admin.from("calendar_events_cache").insert(
      mapped.map((event) => ({
        user_id: userId,
        provider: "google",
        ...event,
        synced_at: new Date().toISOString(),
      })),
    );
    if (error) throw new HttpError(503, "שמירת אירועי היומן נכשלה.");
  }
  return { stored: mapped.length };
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
  if (error) {
    if (/PGRST205|schema cache|calendar_events_cache/i.test(error.message ?? "")) {
      return [];
    }
    throw new HttpError(503, "טעינת אירועי היומן נכשלה.");
  }
  return data ?? [];
}
