import type { SupabaseClient } from "@supabase/supabase-js";
import { envFlag } from "../auth/identity.ts";

export type NativePushTarget = {
  id: string;
  platform: "ios" | "android";
  push_token: string;
  push_provider: "apns" | "fcm";
};

export async function loadNativePushTargets(
  db: SupabaseClient,
  userId: string,
): Promise<NativePushTarget[]> {
  const { data, error } = await db
    .from("user_installations")
    .select("id,platform,push_token,push_provider,revoked_at")
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error || !data) return [];
  return data.flatMap((row) => {
    if (!row.push_token || !row.push_provider) return [];
    if (row.push_provider !== "apns" && row.push_provider !== "fcm") return [];
    if (row.platform !== "ios" && row.platform !== "android") return [];
    return [
      {
        id: row.id as string,
        platform: row.platform,
        push_token: row.push_token as string,
        push_provider: row.push_provider,
      },
    ];
  });
}

export async function deliverNativePush(input: {
  targets: NativePushTarget[];
  title: string;
  body: string;
  route: string;
}) {
  if (!envFlag("NATIVE_PUSH_ENABLED", false)) {
    return { delivered: 0, skipped: input.targets.length, failed: 0 };
  }
  let delivered = 0;
  let failed = 0;
  let skipped = 0;
  for (const target of input.targets) {
    try {
      if (target.push_provider === "apns") {
        const ok = await sendApns(target.push_token, input);
        if (ok) delivered += 1;
        else skipped += 1;
      } else {
        const ok = await sendFcm(target.push_token, input);
        if (ok) delivered += 1;
        else skipped += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { delivered, skipped, failed };
}

async function sendApns(
  token: string,
  payload: { title: string; body: string; route: string },
) {
  const key = process.env.APNS_KEY_P8?.trim();
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const bundle = process.env.APPLE_BUNDLE_ID?.trim();
  if (!key || !keyId || !teamId || !bundle) return false;
  const host =
    process.env.APNS_HOST?.trim() || "https://api.push.apple.com";
  const jwt = await import("./apns-jwt.ts").then((mod) =>
    mod.createApnsJwt({ key, keyId, teamId }),
  );
  const response = await fetch(`${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": bundle,
      "apns-push-type": "alert",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
      route: payload.route,
    }),
  });
  return response.status === 200;
}

async function sendFcm(
  token: string,
  payload: { title: string; body: string; route: string },
) {
  const serverKey = process.env.FCM_SERVER_KEY?.trim();
  if (!serverKey) return false;
  const response = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${serverKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      notification: { title: payload.title, body: payload.body },
      data: { route: payload.route },
      android: { priority: "high" },
    }),
  });
  return response.ok;
}
