import { isSessionId } from "./chat-sessions.ts";

export const APP_VIEWS = [
  "home",
  "chat",
  "tasks",
  "shopping",
  "checklists",
  "recordings",
  "notifications",
  "forgotten",
  "deep-check",
  "focus",
  "schedule",
  "free-time",
  "settings",
] as const;
export type AppView = (typeof APP_VIEWS)[number];

export type AppRouteState = {
  view: AppView;
  date: string | null;
  sessionId: string | null;
  checklistId?: string | null;
  taskId?: string | null;
  shoppingId?: string | null;
  notificationId?: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidScheduleDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function decodeAppRoute(input: URLSearchParams | string): AppRouteState {
  const params =
    typeof input === "string"
      ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
      : input;
  const rawView = params.get("view");
  const view = APP_VIEWS.includes(rawView as AppView)
    ? (rawView as AppView)
    : "home";
  const sessionId = view === "chat" && isSessionId(params.get("session"))
    ? params.get("session")
    : null;
  const date = view === "schedule" && isValidScheduleDate(params.get("date"))
    ? params.get("date")
    : null;
  const checklistId =
    view === "checklists" && isSessionId(params.get("checklist"))
    ? params.get("checklist")
    : null;
  const taskId = view === "tasks" && isSessionId(params.get("task")) ? params.get("task") : null;
  const shoppingId = view === "shopping" && isSessionId(params.get("shopping")) ? params.get("shopping") : null;
  const notificationId = view === "notifications" && isSessionId(params.get("notification")) ? params.get("notification") : null;
  if (view === "checklists") return { view, date, sessionId, checklistId };
  if (view === "tasks") return { view, date, sessionId, taskId };
  if (view === "shopping") return { view, date, sessionId, shoppingId };
  if (view === "notifications") return { view, date, sessionId, notificationId };
  return { view, date, sessionId };
}

export function encodeAppRoute(state: AppRouteState) {
  const params = new URLSearchParams();
  if (state.view !== "home") params.set("view", state.view);
  if (state.view === "schedule" && isValidScheduleDate(state.date)) {
    params.set("date", state.date);
  }
  if (state.view === "chat" && isSessionId(state.sessionId)) {
    params.set("session", state.sessionId);
  }
  if (state.view === "checklists" && isSessionId(state.checklistId)) {
    params.set("checklist", state.checklistId);
  }
  if (state.view === "tasks" && isSessionId(state.taskId)) params.set("task", state.taskId);
  if (state.view === "shopping" && isSessionId(state.shoppingId)) params.set("shopping", state.shoppingId);
  if (state.view === "notifications" && isSessionId(state.notificationId)) params.set("notification", state.notificationId);
  const query = params.toString();
  return query ? `/app?${query}` : "/app";
}
