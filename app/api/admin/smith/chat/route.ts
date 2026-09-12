import { adminJsonError } from "@/lib/admin-api";
import { createServiceClient } from "@/lib/supabase-admin";
import { authorizeAdmin, HttpError } from "@/lib/server-auth";
import { smithControlEnabled } from "@/lib/smith/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireControlPlane() {
  if (!smithControlEnabled()) {
    throw new HttpError(503, "Smith Control Plane עדיין לא הוגדר.");
  }
}

export async function GET(req: Request) {
  try {
    const admin = await authorizeAdmin(req);
    requireControlPlane();
    const threadId = new URL(req.url).searchParams.get("threadId");
    const db = createServiceClient().schema("smith_control");
    if (threadId) {
      const thread = await db
        .from("smith_chat_threads")
        .select("*")
        .eq("id", threadId)
        .eq("admin_user_id", admin.userId)
        .single();
      if (thread.error) throw new HttpError(404, "השיחה לא נמצאה.");
      const messages = await db
        .from("smith_chat_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (messages.error) throw new HttpError(503, "טעינת ההודעות נכשלה.");
      return Response.json({
        thread: thread.data,
        messages: messages.data ?? [],
      });
    }

    const threads = await db
      .from("smith_chat_threads")
      .select("*")
      .eq("admin_user_id", admin.userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (threads.error) throw new HttpError(503, "טעינת השיחות נכשלה.");
    return Response.json({ threads: threads.data ?? [] });
  } catch (error) {
    return adminJsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await authorizeAdmin(req);
    requireControlPlane();
    const body = await req.json().catch(() => null);
    const content =
      typeof body?.content === "string" ? body.content.trim() : "";
    const clientMessageId =
      typeof body?.clientMessageId === "string"
        ? body.clientMessageId.trim()
        : "";
    if (!content || content.length > 8_000) {
      throw new HttpError(400, "נדרשת הודעה תקינה.");
    }
    if (!/^[A-Za-z0-9-]{8,100}$/.test(clientMessageId)) {
      throw new HttpError(400, "מזהה ההודעה אינו תקין.");
    }

    const db = createServiceClient().schema("smith_control");
    let threadId = typeof body?.threadId === "string" ? body.threadId : null;
    if (threadId) {
      const existingThread = await db
        .from("smith_chat_threads")
        .select("id")
        .eq("id", threadId)
        .eq("admin_user_id", admin.userId)
        .single();
      if (existingThread.error) throw new HttpError(404, "השיחה לא נמצאה.");
    } else {
      const createdThread = await db
        .from("smith_chat_threads")
        .insert({
          admin_user_id: admin.userId,
          title: content.slice(0, 80),
          work_item_id: body?.workItemId ?? null,
        })
        .select("id")
        .single();
      if (createdThread.error) throw new HttpError(503, "יצירת השיחה נכשלה.");
      threadId = createdThread.data.id;
    }

    const inserted = await db
      .from("smith_chat_messages")
      .insert({
        thread_id: threadId,
        role: "admin",
        content,
        client_message_id: clientMessageId,
      })
      .select("*")
      .single();
    if (inserted.error?.code === "23505") {
      const existing = await db
        .from("smith_chat_messages")
        .select("*")
        .eq("thread_id", threadId)
        .eq("client_message_id", clientMessageId)
        .single();
      return Response.json({
        threadId,
        message: existing.data,
        replay: true,
        smith: { state: "disconnected" },
      });
    }
    if (inserted.error) throw new HttpError(503, "שמירת ההודעה נכשלה.");

    await db
      .from("smith_chat_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadId);
    await db.from("smith_audit_log").insert({
      action: "chat.message.created",
      actor_type: "admin",
      actor_id: admin.userId,
      environment: "local",
      target_type: "chat_message",
      target_id: inserted.data.id,
      work_item_id: body?.workItemId ?? null,
      status: "completed",
      metadata: { threadId },
    });

    return Response.json(
      {
        threadId,
        message: inserted.data,
        replay: false,
        smith: {
          state: "disconnected",
          reason: "Smith Runner עדיין לא חובר.",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return adminJsonError(error);
  }
}
