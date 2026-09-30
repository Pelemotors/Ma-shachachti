import { z } from "zod";
import { authorize, HttpError } from "@/lib/server-auth";
import { applyReminderAction, type ReminderAction } from "@/lib/notification-lifecycle";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("handled") }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("snooze"), until: z.string().datetime() }),
  z.object({ action: z.literal("change"), until: z.string().datetime() }),
]);

export async function PATCH(req: Request, context: RouteContext<"/api/notifications/[id]">) {
  try {
    const { db, userId } = await authorize(req);
    const { id } = await context.params;
    const input = actionSchema.parse(await req.json());
    const { data: current, error: loadError } = await db
      .from("app_notifications")
      .select("id,state,remind_at,handled_at,snoozed_until,payload")
      .eq("id", id).eq("user_id", userId).maybeSingle();
    if (loadError) throw new HttpError(503, "לא הצלחנו לטעון את ההתראה.");
    if (!current) throw new HttpError(404, "ההתראה לא נמצאה.");
    const action: ReminderAction = input.action === "handled"
      ? { kind: "handled" }
      : input.action === "cancel"
        ? { kind: "cancel" }
        : { kind: input.action, until: input.until };
    const next = applyReminderAction(current, action);
    const { data, error } = await db.from("app_notifications").update({
      state: next.state,
      remind_at: next.remind_at,
      snoozed_until: next.snoozed_until ?? null,
      handled_at: next.handled_at ?? null,
      cancelled_at: next.state === "cancelled" ? new Date().toISOString() : null,
    }).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
    if (error || !data) throw new HttpError(503, "לא הצלחנו לעדכן את ההתראה.");
    return Response.json({ notification: data });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "עדכון ההתראה נכשל." }, { status: 400 });
  }
}
