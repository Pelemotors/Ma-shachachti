import type { Action, AppState, ExecutionReceipt } from "@/lib/model";

export function entityIdFromAction(action: Action): string | null {
  if (action.type === "task.create") return action.task.id ?? null;
  if ("id" in action && typeof action.id === "string") return action.id;
  if ("taskId" in action && typeof action.taskId === "string")
    return action.taskId;
  return null;
}

export function buildExecutionReceipt(input: {
  proposalId?: string | null;
  turnId?: string | null;
  resolvedAt: string;
  actions: Action[];
}): ExecutionReceipt {
  return {
    proposalId: input.proposalId ?? null,
    turnId: input.turnId ?? null,
    resolvedAt: input.resolvedAt,
    actions: input.actions.slice(0, 40).map((action) => ({
      type: action.type,
      entityId: entityIdFromAction(action),
    })),
  };
}

export function appendExecutionReceipt(
  state: AppState,
  receipt: ExecutionReceipt,
): AppState {
  return {
    ...state,
    recentExecutionReceipts: [
      ...(state.recentExecutionReceipts ?? []),
      receipt,
    ].slice(-20),
  };
}
