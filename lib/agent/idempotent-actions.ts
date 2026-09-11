import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult, AgentAction } from "../types.ts";

export type ActionExecutionScope = "turn" | "proposal";

function isActionResult(value: unknown): value is ActionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.ok === "boolean" &&
    typeof result.type === "string" &&
    (result.ok === true || typeof result.error === "string")
  );
}

export async function executeIdempotentActions(
  db: SupabaseClient,
  input: {
    scope: ActionExecutionScope;
    scopeId: string;
    actions: AgentAction[];
  },
) {
  const results: ActionResult[] = [];
  for (const [index, action] of input.actions.entries()) {
    const { data, error } = await db.rpc("execute_lean_action_idempotent", {
      p_scope: input.scope,
      p_scope_id: input.scopeId,
      p_action_index: index,
      p_action: action,
    });
    if (error) throw error;
    if (!isActionResult(data)) throw new Error("invalid_action_receipt");
    results.push(data);
  }
  return results;
}
