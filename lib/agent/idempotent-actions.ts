import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult, AgentAction } from "../types.ts";
import { executeAction } from "../actions.ts";

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

function isTsBackedAction(action: AgentAction) {
  if (action.type.startsWith("task.subtask.")) return true;
  if (action.type.startsWith("routine.")) return true;
  if (action.type.startsWith("checklist.")) return true;
  if (
    action.type === "task.duplicate" ||
    action.type === "checklist.duplicate" ||
    action.type === "checklist.reset" ||
    action.type === "checklist.archive" ||
    action.type === "checklist.item.reorder" ||
    action.type === "checklist.item.toggle"
  ) {
    return true;
  }
  if (
    action.type === "task.create" &&
    (action.estimate_minutes != null || action.checklist_id != null)
  ) {
    return true;
  }
  if (
    action.type === "task.update" &&
    (action.estimate_patch === "set" ||
      action.estimate_patch === "clear" ||
      action.checklist_patch === "set" ||
      action.checklist_patch === "clear")
  ) {
    return true;
  }
  if (
    (action.type === "task.complete" || action.type === "task.reopen") &&
    action.occurrence_date
  ) {
    return true;
  }
  return false;
}

export async function executeIdempotentActions(
  db: SupabaseClient,
  input: {
    scope: ActionExecutionScope;
    scopeId: string;
    actions: AgentAction[];
    /** Required for TS-backed actions (subtasks) that are not yet in the SQL RPC. */
    userId?: string;
  },
) {
  const results: ActionResult[] = [];
  for (const [index, action] of input.actions.entries()) {
    if (isTsBackedAction(action)) {
      if (!input.userId) {
        results.push({
          ok: false,
          type: action.type,
          error: "חסר מזהה משתמש לפעולת תת־משימה.",
        });
        continue;
      }
      const { data: prior } = await db
        .from("agent_action_executions")
        .select("result")
        .eq("scope", input.scope)
        .eq("scope_id", input.scopeId)
        .eq("action_index", index)
        .maybeSingle();
      if (prior && isActionResult(prior.result)) {
        results.push(prior.result);
        continue;
      }
      const receipt = await executeAction(db, input.userId, action);
      await db.from("agent_action_executions").insert({
        user_id: input.userId,
        scope: input.scope,
        scope_id: input.scopeId,
        action_index: index,
        action,
        result: receipt,
      });
      results.push(receipt);
      continue;
    }

    const { data, error } = await db.rpc("execute_lean_action_idempotent", {
      p_scope: input.scope,
      p_scope_id: input.scopeId,
      p_action_index: index,
      p_action: action,
    });
    if (error) throw error;
    if (!isActionResult(data)) throw new Error("invalid_action_receipt");
    if (
      data.ok &&
      action.type === "shopping.toggle" &&
      action.purchased != null
    ) {
      results.push({
        ...data,
        title: data.title ?? action.title,
        purchased: action.purchased === true,
      });
    } else {
      results.push(data);
    }
  }
  return results;
}
