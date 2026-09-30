import { encodeAppRoute, type AppRouteState } from "./app-route-state.ts";

export type NotificationEntity =
  | { kind: "task"; id: string }
  | { kind: "shopping"; id: string }
  | { kind: "checklist"; id: string }
  | { kind: "notification"; id: string };

export function notificationEntityFromPayload(payload: unknown): NotificationEntity | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  if (typeof value.taskId === "string" && value.taskId) return { kind: "task", id: value.taskId };
  if (typeof value.shoppingId === "string" && value.shoppingId) return { kind: "shopping", id: value.shoppingId };
  if (typeof value.checklistId === "string" && value.checklistId) return { kind: "checklist", id: value.checklistId };
  if (typeof value.notificationId === "string" && value.notificationId) return { kind: "notification", id: value.notificationId };
  return null;
}

export function routeForNotificationEntity(entity: NotificationEntity): AppRouteState {
  const base = { date: null, sessionId: null };
  if (entity.kind === "task") return { ...base, view: "tasks", taskId: entity.id };
  if (entity.kind === "shopping") return { ...base, view: "shopping", shoppingId: entity.id };
  if (entity.kind === "checklist") return { ...base, view: "checklists", checklistId: entity.id };
  return { ...base, view: "notifications", notificationId: entity.id };
}

export function routeForNotificationPayload(payload: unknown) {
  const entity = notificationEntityFromPayload(payload);
  return entity ? encodeAppRoute(routeForNotificationEntity(entity)) : null;
}
