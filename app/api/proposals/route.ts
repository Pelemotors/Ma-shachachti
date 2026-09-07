import { authorize, fail, ApiError, jsonBody } from "@/lib/server";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const { data, error } = await db
      .from("pending_proposals")
      .select("*")
      .eq("owner_id", userId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error)
      throw new ApiError(
        503,
        "לא ניתן לקרוא הצעות ממתינות.",
        "proposals_read_failed",
      );
    return Response.json({ proposals: data ?? [] });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = z
      .object({
        type: z.enum(["plan", "shopping", "complex", "replan", "other"]),
        payload: z.record(z.string(), z.unknown()),
        turnId: z.string().uuid().nullable().optional(),
        sourceRevision: z.number().int().min(0),
        expiresAt: z.string().datetime({ offset: true }).optional(),
      })
      .parse(await jsonBody(req, 50_000));
    const expiresAt =
      body.expiresAt ??
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from("pending_proposals")
      .insert({
        owner_id: userId,
        turn_id: body.turnId ?? null,
        type: body.type,
        payload: body.payload,
        source_revision: body.sourceRevision,
        status: "pending",
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (error)
      throw new ApiError(503, "לא ניתן לשמור הצעה.", "proposals_write_failed");
    return Response.json({ proposal: data });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = z
      .object({
        id: z.string().uuid(),
        status: z.enum(["accepted", "partial", "declined", "expired"]),
        payload: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(await jsonBody(req, 50_000));
    const { data, error } = await db
      .from("pending_proposals")
      .update({
        status: body.status,
        ...(body.payload ? { payload: body.payload } : {}),
      })
      .eq("id", body.id)
      .eq("owner_id", userId)
      .select("*")
      .maybeSingle();
    if (error)
      throw new ApiError(503, "לא ניתן לעדכן הצעה.", "proposals_update_failed");
    if (!data) throw new ApiError(404, "ההצעה לא נמצאה.", "proposal_not_found");
    return Response.json({ proposal: data });
  } catch (e) {
    return fail(e);
  }
}
