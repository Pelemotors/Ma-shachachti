import { z } from "zod";
import { authorize, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase-admin";
import {
  acceptInvite,
  createHousehold,
  createInvite,
  leaveHousehold,
  loadMembership,
  revokeInvite,
} from "@/lib/household";

export const runtime = "nodejs";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "פעולת המרחב המשותף נכשלה." }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const membership = await loadMembership(db, userId);
    if (!membership) return Response.json({ household: null, members: [] });
    const { data: household } = await db
      .from("households")
      .select("id,title,owner_id")
      .eq("id", membership.household_id)
      .maybeSingle();
    const { data: members } = await db
      .from("household_members")
      .select("user_id,role")
      .eq("household_id", membership.household_id);
    return Response.json({ household, members: members ?? [], role: membership.role });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await authorize(req);
    const body = z
      .object({
        action: z.enum(["create", "invite", "accept", "revoke", "leave"]),
        title: z.string().max(80).optional(),
        token: z.string().optional(),
        invite_id: z.string().uuid().optional(),
      })
      .parse(await req.json());
    const admin = createServiceClient();
    if (body.action === "create") {
      return Response.json({ household: await createHousehold(admin, userId, body.title) });
    }
    if (body.action === "invite") {
      return Response.json(await createInvite(admin, userId));
    }
    if (body.action === "accept") {
      if (!body.token) throw new HttpError(400, "חסר קוד הזמנה.");
      return Response.json(await acceptInvite(admin, userId, body.token));
    }
    if (body.action === "revoke") {
      if (!body.invite_id) throw new HttpError(400, "חסר מזהה הזמנה.");
      await revokeInvite(admin, userId, body.invite_id);
      return Response.json({ ok: true });
    }
    await leaveHousehold(admin, userId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "בקשה לא תקינה." }, { status: 400 });
    }
    return jsonError(error);
  }
}
