import { z } from "zod";

export function validPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      [
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export function vapidConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      process.env.VAPID_SUBJECT?.trim(),
  );
}

export function pushRuntimeReady() {
  return Boolean(
    vapidConfigured() &&
      process.env.CRON_SECRET?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export const PushSubscriptionInput = z.object({
  endpoint: z.string().max(2000).refine(validPushEndpoint),
  keys: z.object({
    p256dh: z.string().min(20).max(200),
    auth: z.string().min(10).max(200),
  }),
});
