import type { SupabaseClient } from "@supabase/supabase-js";
import {
  notificationLogicalKey,
  type NotificationKind,
} from "../auth/identity.ts";

export async function recordAppNotification(
  db: SupabaseClient,
  input: {
    userId: string;
    kind: NotificationKind;
    subject: string;
    title: string;
    body?: string;
    route?: string;
    payload?: Record<string, unknown>;
  },
) {
  const logicalKey = notificationLogicalKey(input.kind, input.subject);
  const { data, error } = await db
    .from("app_notifications")
    .upsert(
      {
        user_id: input.userId,
        kind: input.kind,
        logical_key: logicalKey,
        title: input.title,
        body: input.body ?? null,
        route: input.route ?? "/app",
        payload: input.payload ?? {},
      },
      { onConflict: "user_id,logical_key", ignoreDuplicates: true },
    )
    .select("id,logical_key")
    .maybeSingle();
  if (error) return { created: false, logicalKey, id: null as string | null };
  return {
    created: Boolean(data?.id),
    logicalKey,
    id: (data?.id as string | undefined) ?? null,
  };
}

export function kindEnabled(
  kinds: Record<string, unknown> | null | undefined,
  kind: NotificationKind,
) {
  if (!kinds || typeof kinds !== "object") return true;
  const value = kinds[kind];
  return value !== false;
}
