import webpush from "web-push";
import { timingSafeEqual } from "node:crypto";
import { adminDb, ApiError, fail } from "@/lib/server";
import { validPushEndpoint } from "@/lib/push";
import { migrateState, type AppState } from "@/lib/model";
import {
  evaluateNotificationPolicy,
  buildLifeAdminDigest,
} from "@/lib/domain/notifications";
import { dayKey } from "@/lib/time";

export const runtime = "nodejs";
export const maxDuration = 60;

type Urgency = "urgent" | "medium" | "low";
const pushOptions: Record<
  Urgency,
  { TTL: number; urgency: "high" | "normal" | "low" }
> = {
  urgent: { TTL: 1800, urgency: "high" },
  medium: { TTL: 3600, urgency: "normal" },
  low: { TTL: 21600, urgency: "low" },
};

const MEDIUM_CAP_PER_DAY = 3;

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
    if (error)
      throw new ApiError(503, "Queue unavailable", "queue_unavailable");

    const mediumSentToday = new Map<string, number>();
    // Durable baseline: count already-sent medium reminders for local day from queue+state.
    async function mediumUsed(
      ownerId: string,
      timezone: string,
      st: AppState | null,
    ) {
      const day = dayKey(new Date(), timezone);
      const key = `${ownerId}:${day}`;
      if (mediumSentToday.has(key)) return mediumSentToday.get(key)!;
      // Approximate: count sent reminders whose dueAt local day matches and urgency medium.
      const used = (st?.reminders ?? []).filter((r) => {
        if (r.status !== "sent") return false;
        if ((r.urgency ?? "medium") !== "medium") return false;
        return dayKey(new Date(r.dueAt), timezone) === day;
      }).length;
      // Also count queue deliveries today when available.
      const { data: delivered } = await db!
        .from("reminder_queue")
        .select("id,delivered_at")
        .eq("owner_id", ownerId)
        .eq("status", "sent")
        .gte(
          "delivered_at",
          new Date(Date.now() - 36 * 3600_000).toISOString(),
        );
      let fromQueue = 0;
      for (const row of delivered ?? []) {
        if (!row.delivered_at) continue;
        if (dayKey(new Date(row.delivered_at), timezone) !== day) continue;
        const rem = st?.reminders.find((r) => r.id === row.id);
        if ((rem?.urgency ?? "medium") === "medium") fromQueue += 1;
      }
      const n = Math.max(used, fromQueue);
      mediumSentToday.set(key, n);
      return n;
    }
    let sent = 0;
    await Promise.all(
      (jobs ?? []).map(
        async (job: { id: string; owner_id: string; attempts: number }) => {
          const { data: owner } = await db!
            .from("app_states")
            .select("data")
            .eq("owner_id", job.owner_id)
            .single();
          const state = owner?.data ? migrateState(owner.data) : null;
          const profile = state?.profile;
          const reminder =
            state?.reminders.find((r) => r.id === job.id) ?? null;
          const decision = evaluateNotificationPolicy({
            reminder,
            profile: profile ?? null,
            now: new Date(),
          });
          const urgency: Urgency = decision.urgency;

          if (!decision.shouldNotify) {
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

          const tz = profile?.timezone ?? "Asia/Jerusalem";
          if (urgency === "medium") {
            const key = `${job.owner_id}:${dayKey(new Date(), tz)}`;
            const used = await mediumUsed(job.owner_id, tz, state);
            if (used >= MEDIUM_CAP_PER_DAY) {
              await db!
                .from("reminder_queue")
                .update({
                  lease_until: new Date(Date.now() + 60 * 60000).toISOString(),
                  attempts: job.attempts - 1,
                  last_error: "medium_daily_cap",
                })
                .eq("id", job.id)
                .eq("status", "pending");
              return;
            }
            mediumSentToday.set(key, used + 1);
          }

          let digestBody: string | null = null;
          if (state && decision.channel === "digest" && urgency === "medium") {
            const digest = buildLifeAdminDigest(
              state.tasks,
              state.compactedMemory,
              new Date(),
            );
            if (digest.summary) digestBody = digest.summary;
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
                      reminder?.title?.trim() ||
                      digestBody ||
                      "יש תזכורת שמחכה לך.",
                    tag: job.id,
                    url: "/app?view=reminders",
                    urgency,
                    silent: false,
                    renotify: true,
                    vibrate: urgency === "urgent" ? [200, 100, 200] : [100],
                    icon: "/icon-192.png",
                    badge: "/icon-192.png",
                    data: { url: "/app?view=reminders", reminderId: job.id },
                  }),
                  {
                    ...pushOptions[urgency],
                    TTL: urgency === "urgent" ? 120 : 3600,
                    headers: {
                      Urgency: urgency === "urgent" ? "high" : "normal",
                    },
                    timeout: 8000,
                  },
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
            throw new ApiError(
              503,
              "Queue update failed",
              "queue_update_failed",
            );
          if (delivered) sent++;
        },
      ),
    );

    await Promise.all([
      db
        .from("ai_budgets")
        .delete()
        .lt("bucket", new Date(Date.now() - 8 * 86400000).toISOString()),
      db
        .from("activity_events")
        .delete()
        .lt("created_at", new Date(Date.now() - 90 * 86400000).toISOString()),
      db
        .from("action_receipts")
        .delete()
        .lt("created_at", new Date(Date.now() - 8 * 86400000).toISOString()),
    ]);
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
