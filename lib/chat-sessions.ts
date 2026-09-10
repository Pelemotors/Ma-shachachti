import type { SupabaseClient } from "@supabase/supabase-js";
import { UUID_RE } from "./action-schema.ts";

export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export async function createChatSession(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("chat_sessions")
    .insert({ user_id: userId })
    .select("id,created_at")
    .single();
  if (error || !data) return null;
  return data as { id: string; created_at: string };
}

export async function latestChatSession(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("chat_sessions")
    .select("id,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as { id: string; created_at: string } | null) ?? null;
}

export async function latestOrCreateChatSession(
  db: SupabaseClient,
  userId: string,
) {
  return (await latestChatSession(db, userId)) ?? createChatSession(db, userId);
}

export async function ownChatSession(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
) {
  const { data, error } = await db
    .from("chat_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .maybeSingle();
  return !error && Boolean(data);
}
