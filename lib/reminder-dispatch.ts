import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_REMINDER_MINUTES, REMINDER_CLAIM_STALE_MS } from "./reminders.ts";
import {
  goneSubscriptionStatus,
  isClaimFresh,
  planTaskReminder,
  type ReminderTask,
} from "./reminder-plan.ts";

type PushRow = {
  endpoint: string;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
};

export type PushSender = (
  subscription: PushRow["subscription"],
  payload: string,
) => Promise<void>;

export function configureWebPush() {
  const subject = process.env.VAPID_SUBJECT?.trim();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function deliverToSubscriptions(
  subscriptions: PushRow[],
  payload: string,
  send: PushSender,
  onGone: (endpoint: string) => Promise<void>,
) {
  let delivered = 0;
  let failed = 0;
  for (const row of subscriptions) {
    try {
      await send(row.subscription, payload);
      delivered += 1;
    } catch (error) {
      const status = Number(
        (error as { statusCode?: number } | null)?.statusCode,
      );
      if (goneSubscriptionStatus(status)) {
        await onGone(row.endpoint);
      } else {
        failed += 1;
      }
    }
  }
  return { delivered, failed };
}

export async function dispatchDueReminders(
  db: SupabaseClient,
  options: {
    now?: Date;
    send?: PushSender;
    requireVapid?: boolean;
  } = {},
) {
  const now = options.now ?? new Date();
  const requireVapid = options.requireVapid !== false;
  if (requireVapid && !options.send && !configureWebPush()) {
    return { scanned: 0, sent: 0, skipped: 0, failed: 0 };
  }
  const send: PushSender =
    options.send ??
    (async (subscription, payload) => {
      await webpush.sendNotification(subscription, payload, {
        TTL: 3600,
        urgency: "normal",
      });
    });

  const { data: tasks, error } = await db
    .from("tasks")
    .select(
      "id,user_id,title,status,due_at,reminder_enabled,reminder_offset_minutes,reminder_sent_at,reminder_claimed_at",
    )
    .eq("status", "open")
    .eq("reminder_enabled", true)
    .not("due_at", "is", null)
    .is("reminder_sent_at", null)
    .limit(200);
  if (error) throw error;

  const { data: prefs } = await db
    .from("notification_preferences")
    .select("user_id,default_reminder_minutes");
  const defaults = new Map(
    (prefs ?? []).map((row) => [
      row.user_id as string,
      Number.isFinite(Number(row.default_reminder_minutes))
        ? Number(row.default_reminder_minutes)
        : DEFAULT_REMINDER_MINUTES,
    ]),
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const nowIso = now.toISOString();

  for (const raw of tasks ?? []) {
    const task = raw as ReminderTask;
    if (isClaimFresh(task.reminder_claimed_at, now)) continue;

    const plan = planTaskReminder(
      task,
      defaults.get(task.user_id) ?? DEFAULT_REMINDER_MINUTES,
      now,
    );
    if (plan.kind === "wait") continue;
    if (plan.kind === "skip") {
      skipped += 1;
      continue;
    }

    const staleIso = new Date(now.getTime() - REMINDER_CLAIM_STALE_MS).toISOString();
    const { data: claimed } = await db
      .from("tasks")
      .update({ reminder_claimed_at: nowIso })
      .eq("id", task.id)
      .eq("status", "open")
      .is("reminder_sent_at", null)
      .or(
        `reminder_claimed_at.is.null,reminder_claimed_at.lt."${staleIso}"`,
      )
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    if (plan.kind === "expire") {
      await db
        .from("tasks")
        .update({
          reminder_sent_at: nowIso,
          reminder_claimed_at: nowIso,
        })
        .eq("id", task.id)
        .is("reminder_sent_at", null);
      skipped += 1;
      continue;
    }

    const { data: subscriptions } = await db
      .from("user_push_subscriptions")
      .select("endpoint,subscription")
      .eq("user_id", task.user_id);

    const payload = JSON.stringify({
      title: "מה שכחתי?",
      body: task.title,
      url: "/app",
      tag: `task-${task.id}`,
      data: { taskId: task.id, url: "/app" },
    });
    const result = await deliverToSubscriptions(
      (subscriptions ?? []) as PushRow[],
      payload,
      send,
      async (endpoint) => {
        await db.from("user_push_subscriptions").delete().eq("endpoint", endpoint);
      },
    );
    failed += result.failed;
    if (result.delivered > 0) {
      await db
        .from("tasks")
        .update({ reminder_sent_at: nowIso })
        .eq("id", task.id);
      sent += 1;
    }
  }

  return {
    scanned: (tasks ?? []).length,
    sent,
    skipped,
    failed,
  };
}
