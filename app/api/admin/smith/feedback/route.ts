import { adminJsonError } from "@/lib/admin-api";
import { createServiceClient } from "@/lib/supabase-admin";
import { authorizeAdmin, HttpError } from "@/lib/server-auth";
import { smithControlEnabled } from "@/lib/smith/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const admin = await authorizeAdmin(req);
    if (!smithControlEnabled()) {
      throw new HttpError(503, "Smith Control Plane עדיין לא הוגדר.");
    }
    const body = await req.json().catch(() => null);
    const kind = body?.kind;
    const content =
      typeof body?.content === "string" ? body.content.trim() : "";
    if (!["useful", "not_useful", "correction", "follow_up"].includes(kind)) {
      throw new HttpError(400, "סוג המשוב אינו תקין.");
    }
    if (content.length > 4_000) {
      throw new HttpError(400, "המשוב ארוך מדי.");
    }

    const db = createServiceClient().schema("smith_control");
    if (body?.threadId) {
      const thread = await db
        .from("smith_chat_threads")
        .select("id")
        .eq("id", body.threadId)
        .eq("admin_user_id", admin.userId)
        .single();
      if (thread.error) throw new HttpError(404, "השיחה לא נמצאה.");
    }

    const inserted = await db
      .from("smith_feedback")
      .insert({
        work_item_id: body?.workItemId ?? null,
        thread_id: body?.threadId ?? null,
        message_id: body?.messageId ?? null,
        admin_user_id: admin.userId,
        kind,
        content,
      })
      .select("*")
      .single();
    if (inserted.error) throw new HttpError(503, "שמירת המשוב נכשלה.");

    return Response.json(
      {
        feedback: inserted.data,
        learning: {
          automatic: false,
          state: "received",
          note: "המשוב נשמר אך אינו משנה קוד או prompt אוטומטית.",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return adminJsonError(error);
  }
}
