import { z } from "zod";
import { authorize, HttpError } from "@/lib/server-auth";
import {
  PushSubscriptionInput,
  pushRuntimeReady,
  vapidConfigured,
} from "@/lib/push";

export const runtime = "nodejs";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return Response.json({ error: "הרשאת ההתראות אינה תקינה." }, { status: 400 });
  }
  console.error("Lean push error");
  return Response.json({ error: "לא הצלחנו לעדכן התראות." }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    await authorize(req);
    return Response.json({
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
      ready: vapidConfigured(),
      deliveryReady: pushRuntimeReady(),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    if (!vapidConfigured()) {
      throw new HttpError(503, "ההתראות עדיין לא מחוברות.");
    }
    const subscription = PushSubscriptionInput.parse(await req.json());
    const { error } = await db.from("user_push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        subscription,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new HttpError(503, "לא הצלחנו לשמור הרשאה להתראות.");
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = z
      .object({ endpoint: z.string().max(2000) })
      .parse(await req.json());
    const { error } = await db
      .from("user_push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", body.endpoint);
    if (error) throw new HttpError(503, "ביטול ההתראות לא הושלם.");
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
