import type { SupabaseClient } from "@supabase/supabase-js";
import { composeReply, inspectActions, UUID_RE } from "./action-schema.ts";
import { executeIdempotentActions } from "./agent/idempotent-actions.ts";
import type { ActionResult, AgentAction, AgentProposal } from "./types.ts";

type Db = SupabaseClient;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export type StoredProposal = {
  id: string;
  user_id: string;
  session_id: string;
  turn_id: string;
  summary: string;
  actions: unknown[];
  status: "pending" | "executing" | "approved" | "rejected" | "expired";
  revision: number;
  action_results: ActionResult[] | null;
  expires_at: string;
};

export function proposalExpiry(
  expiresInSeconds: number | null,
  now = new Date(),
) {
  const seconds = Math.min(Math.max(expiresInSeconds ?? 900, 60), 86400);
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

export async function createAgentProposal(
  db: Db,
  input: {
    userId: string;
    sessionId: string;
    turnId: string;
    proposal: AgentProposal;
  },
) {
  const { data, error } = await db
    .from("agent_proposals")
    .insert({
      user_id: input.userId,
      session_id: input.sessionId,
      turn_id: input.turnId,
      summary: input.proposal.summary,
      actions: input.proposal.actions,
      expires_at: proposalExpiry(input.proposal.expires_in_seconds),
    })
    .select("id,summary,status,revision,expires_at")
    .single();
  if (!error && data) return data;
  if (error?.code !== "23505") throw new Error("proposal_create_failed");

  const { data: existing, error: existingError } = await db
    .from("agent_proposals")
    .select("id,summary,actions,status,revision,expires_at")
    .eq("user_id", input.userId)
    .eq("turn_id", input.turnId)
    .maybeSingle();
  if (existingError || !existing) throw new Error("proposal_create_failed");
  if (
    existing.summary !== input.proposal.summary ||
    canonicalJson(existing.actions) !== canonicalJson(input.proposal.actions)
  ) {
    throw new Error("proposal_turn_conflict");
  }
  return existing;
}

async function loadOwnedProposal(db: Db, userId: string, id: string) {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await db
    .from("agent_proposals")
    .select(
      "id,user_id,session_id,turn_id,summary,actions,status,revision,action_results,expires_at",
    )
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as StoredProposal;
}

export async function approveProposal(db: Db, userId: string, id: string) {
  const proposal = await loadOwnedProposal(db, userId, id);
  if (!proposal) return { ok: false as const, status: 404, error: "ההצעה לא נמצאה." };
  if (proposal.status === "approved") {
    return {
      ok: true as const,
      alreadyExecuted: true,
      results: proposal.action_results ?? [],
      reply: composeReply("", proposal.action_results ?? []),
    };
  }
  if (proposal.status !== "pending" && proposal.status !== "executing") {
    return { ok: false as const, status: 409, error: "ההצעה כבר אינה ממתינה." };
  }
  if (
    proposal.status === "pending" &&
    new Date(proposal.expires_at).getTime() <= Date.now()
  ) {
    await db
      .from("agent_proposals")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .eq("status", "pending");
    return { ok: false as const, status: 410, error: "תוקף ההצעה פג." };
  }

  const inspected = inspectActions(proposal.actions);
  if (inspected.results.length > 0 || inspected.accepted.length === 0) {
    return { ok: false as const, status: 422, error: "פעולות ההצעה אינן תקינות." };
  }

  if (proposal.status === "pending") {
    const { error: claimError } = await db
      .from("agent_proposals")
      .update({ status: "executing", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .eq("status", "pending");
    if (claimError) throw claimError;
  }

  const results = await executeIdempotentActions(db, {
    scope: "proposal",
    scopeId: id,
    actions: inspected.accepted,
  });
  const { error: saveError } = await db
    .from("agent_proposals")
    .update({
      status: "approved",
      action_results: results,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "executing");
  if (saveError) throw new Error("proposal_result_save_failed");
  return {
    ok: true as const,
    alreadyExecuted: false,
    results,
    reply: composeReply("", results),
  };
}

export async function rejectProposal(db: Db, userId: string, id: string) {
  const { data, error } = await db
    .from("agent_proposals")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}

export async function reviseProposal(
  db: Db,
  userId: string,
  input: { id: string; summary: string; actions: unknown[]; expiresInSeconds?: number },
) {
  const summary = input.summary.trim();
  if (
    !UUID_RE.test(input.id) ||
    !summary ||
    summary.length > 500 ||
    !Array.isArray(input.actions) ||
    input.actions.length < 1 ||
    input.actions.length > 10 ||
    input.actions.some((action) => !action || typeof action !== "object")
  ) {
    return null;
  }
  const current = await loadOwnedProposal(db, userId, input.id);
  if (!current || current.status !== "pending") return null;
  const nextRevision = current.revision + 1;
  const { data, error } = await db
    .from("agent_proposals")
    .update({
      summary,
      actions: input.actions as AgentAction[],
      expires_at: proposalExpiry(input.expiresInSeconds ?? null),
      revision: nextRevision,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", input.id)
    .eq("status", "pending")
    .select("id,summary,status,revision,expires_at")
    .maybeSingle();
  return error ? null : data;
}
