import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult, AgentAction } from "../types.ts";
import { mutateSubtask } from "../task-subtasks.ts";

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

function isTsBackedAction(type: string) {
  return type.startsWith("task.subtask.");
}

async function executeSubtaskAction(
  db: SupabaseClient,
  userId: string,
  action: AgentAction,
): Promise<ActionResult> {
  try {
    if (action.type === "task.subtask.add") {
      if (!action.task_id || !action.title) {
        return { ok: false, type: action.type, error: "חסרים פרטי תת־משימה." };
      }
      await mutateSubtask(db, userId, {
        action: "add",
        task_id: action.task_id,
        title: action.title,
      });
      return { ok: true, type: action.type, title: action.title };
    }
    if (action.type === "task.subtask.update") {
      if (!action.id || !action.title) {
        return { ok: false, type: action.type, error: "חסרים פרטי תת־משימה." };
      }
      await mutateSubtask(db, userId, {
        action: "update",
        id: action.id,
        title: action.title,
      });
      return { ok: true, type: action.type, id: action.id, title: action.title };
    }
    if (action.type === "task.subtask.toggle") {
      if (!action.id || action.done == null) {
        return {
          ok: false,
          type: action.type,
          error: "חסר מצב סימון לתת־משימה.",
        };
      }
      await mutateSubtask(db, userId, {
        action: "toggle",
        id: action.id,
        done: action.done === true,
      });
      return { ok: true, type: action.type, id: action.id, title: action.title };
    }
    if (action.type === "task.subtask.remove") {
      if (!action.id) {
        return { ok: false, type: action.type, error: "חסר מזהה תת־משימה." };
      }
      await mutateSubtask(db, userId, { action: "remove", id: action.id });
      return { ok: true, type: action.type, id: action.id, title: action.title };
    }
    return { ok: false, type: "invalid", error: "סוג הפעולה אינו נתמך." };
  } catch (error) {
    return {
      ok: false,
      type: action.type,
      error:
        error instanceof Error ? error.message : "ביצוע תת־משימה נכשל.",
    };
  }
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
    if (isTsBackedAction(action.type)) {
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
      const receipt = await executeSubtaskAction(db, input.userId, action);
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
    results.push(data);
  }
  return results;
}
