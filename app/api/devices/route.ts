import { z } from "zod";
import { authorize, HttpError } from "@/lib/server-auth";
import { isValidTimeZone } from "@/lib/time";
import { logMobileEvent } from "@/lib/observability";

export const runtime = "nodejs";

const Body = z.object({
  installationId: z.string().uuid(),
  platform: z.enum(["web", "ios", "android"]),
  appVersion: z.string().max(40).optional().nullable(),
  buildNumber: z.string().max(40).optional().nullable(),
  pushToken: z.string().max(4000).optional().nullable(),
  pushProvider: z.enum(["web_push", "apns", "fcm"]).optional().nullable(),
  pushPermission: z
    .enum(["UNKNOWN", "GRANTED", "DENIED", "RESTRICTED"])
    .optional()
    .nullable(),
  timezone: z.string().max(80).optional().nullable(),
  revoke: z.boolean().optional(),
});

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return Response.json({ error: "פרטי ההתקנה אינם תקינים." }, { status: 400 });
  }
  return Response.json({ error: "לא הצלחנו לעדכן את המכשיר." }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const { data, error } = await db
      .from("user_installations")
      .select(
        "id,platform,app_version,build_number,push_provider,push_permission,timezone,last_seen_at,revoked_at",
      )
      .eq("user_id", userId);
    if (error) throw new HttpError(503, "לא הצלחנו לטעון מכשירים.");
    return Response.json({ installations: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = Body.parse(await req.json());
    if (body.timezone && !isValidTimeZone(body.timezone)) {
      throw new HttpError(400, "אזור הזמן אינו תקין.");
    }
    const now = new Date().toISOString();
    if (body.revoke) {
      const { error } = await db
        .from("user_installations")
        .update({ revoked_at: now, push_token: null, updated_at: now })
        .eq("id", body.installationId)
        .eq("user_id", userId);
      if (error) throw new HttpError(503, "ביטול המכשיר נכשל.");
      return Response.json({ ok: true, revoked: true });
    }
    const row = {
      id: body.installationId,
      user_id: userId,
      platform: body.platform,
      app_version: body.appVersion ?? null,
      build_number: body.buildNumber ?? null,
      push_token: body.pushToken ?? null,
      push_provider: body.pushProvider ?? null,
      push_permission: body.pushPermission ?? null,
      timezone: body.timezone ?? null,
      last_seen_at: now,
      revoked_at: null,
      updated_at: now,
    };
    const { error } = await db.from("user_installations").upsert(row, {
      onConflict: "id",
    });
    if (error) throw new HttpError(503, "שמירת המכשיר נכשלה.");
    logMobileEvent("DEVICE_REGISTERED", { platform: body.platform });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
