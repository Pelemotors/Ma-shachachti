import webpush from "web-push";
import { timingSafeEqual } from "node:crypto";
import { adminDb, ApiError, fail } from "@/lib/server";
import { validPushEndpoint } from "@/lib/push";

export const runtime = "nodejs";
export const maxDuration = 60;

type Urgency = "urgent" | "medium" | "low";
const pushOptions: Record<Urgency, { TTL: number; urgency: "high" | "normal" | "low" }> = {
  urgent: { TTL: 1800, urgency: "high" },
  medium: { TTL: 3600, urgency: "normal" },
  low: { TTL: 21600, urgency: "low" },
};

export async function GET(req: Request) {
  const started = Date.now();
  let db: ReturnType<typeof adminDb> | null = null;
  try {
    const expected = process.env.CRON_SECRET,
      actual = req.headers.get("authorization");
    if (
      !expected ||
      !actual ||
      Buffer.byteLength(actual) !== Buffer.byteLength(`Bearer ${expected}`) ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(`Bearer ${expected}`))
    )
      throw new ApiError(401, "Unauthorized", "cron_unauthorized");
    if (
      !process.env.VAPID_PRIVATE_KEY ||
      !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
      !process.env.VAPID_SUBJECT
    )
      throw new ApiError(503, "Push not configured", "push_not_configured");

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    db = adminDb();
    const { data: jobs, error } = await db.rpc("claim_due_reminders");
    if (error) throw new ApiError(503, "Queue unavailable", "queue_unavailable");

    let sent = 0;
    await Promise.all(
      (jobs ?? []).map(
        async (job: { id: string; owner_id: string; attempts: number }) => {
          const { data: owner } = await db!
            .from("app_states")
            .select("data")
            .eq("owner_id", job.owner_id)
            .single();
          const profile = owner?.data?.profile;
          const reminder = Array.isArray(owner?.data?.reminders)
            ? owner.data.reminders.find((r: { id?: string }) => r.id === job.id)
            : null;
          const urgency: Urgency = ["urgent", "medium", "low"].includes(
            reminder?.urgency,
          )
            ? reminder.urgency
            : "medium";
          const hour = Number(
            new Intl.DateTimeFormat("en", {
              timeZone: profile?.timezone ?? "Asia/Jerusalem",
              hour: "numeric",
              hourCycle: "h23",
            }).format(new Date()),
          );
          const start = profile?.quietStart ?? 22,
            end = profile?.quietEnd ?? 7;
          const quiet =
            start !== end &&
            (start < end
              ? hour >= start && hour < end
              : hour >= start || hour < end);
          if (quiet && urgency !== "urgent") {
            await db!
              .from("reminder_queue")
              .update({
                lease_until: new Date(Date.now() + 15 * 60000).toISOString(),
                attempts: job.attempts - 1,
              })
              .eq("id", job.id)
              .eq("status", "pending");
            return;
          }

          const { data: subs } = await db!
            .from("push_subscriptions")
            .select("subscription,endpoint")
            .eq("owner_id", job.owner_id)
            .limit(10);
          let delivered = false;
          await Promise.all(
            (subs ?? []).map(async (sub) => {
              if (!validPushEndpoint(sub.endpoint)) return;
              try {
                await webpush.sendNotification(
                  sub.subscription,
                  JSON.stringify({
                    title: "מה שכחתי?",
                    body:
                      urgency === "urgent"
                        ? "יש תזכורת חשובה שמחכה לך."
                        : "יש תזכורת שמחכה לך. אפשר לפתוח כשמתאים.",
                    tag: job.id,
                    url: "/app?view=reminders",
                    urgency,
                  }),
                  { ...pushOptions[urgency], timeout: 8000 },
                );
                delivered = true;
              } catch (e) {
                const status = (e as { statusCode?: number }).statusCode;
                if (status === 404 || status === 410)
                  await db!
                    .from("push_subscriptions")
                    .delete()
                    .eq("owner_id", job.owner_id)
                    .eq("endpoint", sub.endpoint);
              }
            }),
          );

          const patch = delivered
            ? {
                status: "sent",
                delivered_at: new Date().toISOString(),
                lease_until: null,
                last_error: null,
              }
            : job.attempts >= 5
              ? {
                  status: "failed",
                  lease_until: null,
                  last_error: "delivery_failed",
                }
              : {
                  lease_until: new Date(Date.now() + 5 * 60000).toISOString(),
                  last_error: subs?.length
                    ? "delivery_failed"
                    : "no_subscription",
                };
          const { error: updateError } = await db!
            .from("reminder_queue")
            .update(patch)
            .eq("id", job.id)
            .eq("status", "pending");
          if (updateError)
            throw new ApiError(503, "Queue update failed", "queue_update_failed");
          if (delivered) sent++;
        },
      ),
    );

    await db
      .from("ai_budgets")
      .delete()
      .lt("bucket", new Date(Date.now() - 8 * 86400000).toISOString());
    await db.from("activity_events").insert({
      owner_id: null,
      event_type: "cron.reminders.success",
      metadata: {
        processed: jobs?.length ?? 0,
        sent,
        latencyMs: Date.now() - started,
      },
    });
    return Response.json({ processed: jobs?.length ?? 0, sent });
  } catch (e) {
    if (db)
      await db.from("activity_events").insert({
        owner_id: null,
        event_type: "cron.reminders.failure",
        metadata: {
          code: e instanceof ApiError ? e.code : "internal_error",
          latencyMs: Date.now() - started,
        },
      });
    return fail(e);
  }
}
