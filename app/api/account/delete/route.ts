import { z } from "zod";
import { authorize, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await authorize(req);
    const body = z
      .object({ confirm: z.literal("DELETE") })
      .parse(await req.json());
    void body;
    const admin = createServiceClient();
    await admin.from("account_audit").insert({
      user_id: userId,
      event: "account.delete_requested",
      metadata: {},
    });
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) {
      throw new HttpError(503, "מחיקת החשבון נכשלה.");
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return Response.json({ error: "נדרש אישור מפורש למחיקה." }, { status: 400 });
    }
    return Response.json({ error: "מחיקת החשבון נכשלה." }, { status: 500 });
  }
}
