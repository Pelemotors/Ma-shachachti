import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient;

export type StoredTurnResponse = Record<string, unknown>;
export type StoredTurnDecision = Record<string, unknown>;

export async function claimAgentTurn(
  db: Db,
  input: { userId: string; sessionId: string; turnKey: string },
) {
  const { data, error } = await db
    .from("agent_turns")
    .insert({
      user_id: input.userId,
      session_id: input.sessionId,
      turn_key: input.turnKey,
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .select("id,status,response,decision,started_at")
    .single();
  if (!error && data) {
    return {
      kind: "claimed" as const,
      id: data.id as string,
      decision: (data.decision as StoredTurnDecision | null) ?? null,
    };
  }
  if (error?.code !== "23505") throw error;

  const { data: existing, error: existingError } = await db
    .from("agent_turns")
    .select("id,status,response,decision,started_at")
    .eq("user_id", input.userId)
    .eq("turn_key", input.turnKey)
    .maybeSingle();
  if (existingError || !existing) throw existingError ?? error;
  if (existing.status === "completed" && existing.response) {
    return {
      kind: "completed" as const,
      id: existing.id as string,
      response: existing.response as StoredTurnResponse,
    };
  }
  if (existing.status === "processing" && existing.decision) {
    return {
      kind: "claimed" as const,
      id: existing.id as string,
      decision: existing.decision as StoredTurnDecision,
    };
  }
  const startedAt = new Date(String(existing.started_at)).getTime();
  const stale =
    existing.status === "processing" &&
    Number.isFinite(startedAt) &&
    startedAt < Date.now() - 120_000;
  if (existing.status === "failed" || stale) {
    const now = new Date().toISOString();
    const { data: reclaimed, error: reclaimError } = await db
      .from("agent_turns")
      .update({
        status: "processing",
        response: null,
        completed_at: null,
        started_at: now,
      })
      .eq("user_id", input.userId)
      .eq("id", existing.id)
      .eq("started_at", existing.started_at)
      .select("id")
      .maybeSingle();
    if (reclaimError) throw reclaimError;
    if (reclaimed) {
      return {
        kind: "claimed" as const,
        id: reclaimed.id as string,
        decision: (existing.decision as StoredTurnDecision | null) ?? null,
      };
    }
  }
  return { kind: "processing" as const, id: existing.id as string };
}

export async function saveAgentTurnDecision(
  db: Db,
  userId: string,
  id: string,
  decision: StoredTurnDecision,
) {
  const { data, error } = await db
    .from("agent_turns")
    .update({ decision })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "processing")
    .is("decision", null)
    .select("decision")
    .maybeSingle();
  if (error) throw error;
  if (data?.decision) return data.decision as StoredTurnDecision;

  const { data: existing, error: existingError } = await db
    .from("agent_turns")
    .select("decision")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing?.decision) {
    throw existingError ?? new Error("turn_decision_save_failed");
  }
  if (JSON.stringify(existing.decision) !== JSON.stringify(decision)) {
    throw new Error("turn_decision_conflict");
  }
  return existing.decision as StoredTurnDecision;
}

export async function completeAgentTurn(
  db: Db,
  userId: string,
  id: string,
  response: StoredTurnResponse,
) {
  const { error } = await db
    .from("agent_turns")
    .update({
      status: "completed",
      response,
      completed_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "processing");
  if (error) throw error;
}

export async function failAgentTurn(db: Db, userId: string, id: string) {
  await db
    .from("agent_turns")
    .update({ status: "failed", completed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "processing");
}
