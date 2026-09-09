/**
 * Factual history slices for the personal LLM.
 * Select and bound raw records only — never infer frequency, score, or "what to predict".
 */
import type { AppState } from "@/lib/model";

const SHOPPING_EVENT_TYPES = new Set([
  "shopping.item_added",
  "shopping.item_checked",
  "shopping.item_removed",
]);

export function shoppingPurchaseHistory(state: AppState, limit = 80) {
  return state.shopping
    .filter((item) => Boolean(item.purchasedAt))
    .slice(-limit)
    .map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      createdAt: item.createdAt,
      purchasedAt: item.purchasedAt,
    }));
}

export function shoppingFactualEvents(state: AppState, limit = 80) {
  return state.events
    .filter((event) => SHOPPING_EVENT_TYPES.has(event.type))
    .slice(-limit)
    .map((event) => ({
      id: event.id,
      at: event.at,
      type: event.type,
      entityId: event.entityId ?? null,
      payload: event.payload ?? null,
    }));
}

export function recentCompletedTasks(state: AppState, limit = 40) {
  return state.tasks
    .filter((task) => task.status === "done" && task.completedAt)
    .slice(-limit)
    .map((task) => ({
      id: task.id,
      title: task.title,
      completedAt: task.completedAt,
      actualWorkMinutes: task.actualWorkMinutes,
    }));
}
