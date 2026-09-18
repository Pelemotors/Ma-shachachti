import { z } from "zod";
import { authorizeIdentity, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase-admin";
import { deleteUserAccountFully } from "@/lib/account/delete-account";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // Identity-only: unapproved users must still be able to erase their data.
    const { userId } = await authorizeIdentity(req);
    const body = z
      .object({ confirm: z.literal("DELETE") })
      .parse(await req.json());
    void body;
    const admin = createServiceClient();
    const summary = await deleteUserAccountFully(admin, userId);
    return Response.json(summary);
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
