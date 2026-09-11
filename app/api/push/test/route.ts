import { recordActivity } from "@/lib/activity";
import {
  configureWebPush,
  deliverUserPush,
} from "@/lib/reminder-dispatch";
import { pushRuntimeReady } from "@/lib/push";
import { authorize, HttpError } from "@/lib/server-auth";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  }
  console.error("Lean test push failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
  return Response.json(
    { ok: false, error: "שליחת התראת הבדיקה נכשלה." },
    { status: 500 },
  );
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    if (!pushRuntimeReady() || !configureWebPush()) {
      throw new HttpError(503, "שירות ההתראות עדיין אינו מוכן לשליחה.");
    }
    let result;
    try {
      result = await deliverUserPush(
        db,
        userId,
        JSON.stringify({
          title: "מה שכחתי?",
          body: "התראת הבדיקה הגיעה בהצלחה.",
          tag: "push-test",
          url: "/app",
          data: { url: "/app" },
        }),
      );
    } catch (error) {
      await recordActivity(db, {
        ownerId: userId,
        eventType: "push.test.failure",
        metadata: {
          error: error instanceof Error ? error.message : "delivery_failed",
        },
      });
      throw error;
    }
    await recordActivity(db, {
      ownerId: userId,
      eventType: "push.test",
      metadata: result,
    });
    if (result.subscriptions === 0) {
      return Response.json(
        { ok: false, outcome: "no_subscription", ...result, error: "לא נמצא מכשיר רשום." },
        { status: 409 },
      );
    }
    if (result.delivered === 0) {
      return Response.json(
        {
          ok: false,
          outcome: result.gone > 0 ? "subscription_expired" : "delivery_failed",
          ...result,
          error:
            result.gone > 0
              ? "הרישום במכשיר פג. יש להפעיל התראות מחדש."
              : "שירות ה-Push לא אישר את השליחה.",
        },
        { status: 502 },
      );
    }
    return Response.json({ ok: true, outcome: "delivered", ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
