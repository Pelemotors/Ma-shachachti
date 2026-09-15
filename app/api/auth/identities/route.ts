import { z } from "zod";
import { authorize, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "לא הצלחנו לעדכן זהויות." }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const { data, error } = await db
      .from("user_identities")
      .select("id,provider,created_at")
      .eq("user_id", userId);
    if (error) throw new HttpError(503, "לא הצלחנו לטעון זהויות.");
    return Response.json({ identities: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId } = await authorize(req);
    const body = z.object({ provider: z.enum(["apple", "google"]) }).parse(await req.json());
    const admin = createServiceClient();
    const { data: rows } = await admin
      .from("user_identities")
      .select("id,provider")
      .eq("user_id", userId);
    const remaining = (rows ?? []).filter((row) => row.provider !== body.provider);
    if (remaining.length === 0) {
      throw new HttpError(400, "לא ניתן לנתק את אמצעי הכניסה האחרון.");
    }
    const { error } = await admin
      .from("user_identities")
      .delete()
      .eq("user_id", userId)
      .eq("provider", body.provider);
    if (error) throw new HttpError(503, "ניתוק הזהות נכשל.");
    await admin.from("account_audit").insert({
      user_id: userId,
      event: "identity.unlink",
      metadata: { provider: body.provider },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
