import { isSessionId } from "./chat-sessions.ts";

export const APP_VIEWS = ["home", "chat", "tasks", "schedule", "settings"] as const;
export type AppView = (typeof APP_VIEWS)[number];

export type AppRouteState = {
  view: AppView;
  date: string | null;
  sessionId: string | null;
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
  const query = params.toString();
  return query ? `/app?${query}` : "/app";
}
