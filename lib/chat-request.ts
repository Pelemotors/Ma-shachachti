import { isChatSurface, type ChatSurface } from "./home-surfaces.ts";
import { isSessionId } from "./chat-sessions.ts";
import { isValidScheduleDate } from "./app-route-state.ts";

export const FREE_TIME_EFFORTS = ["low", "medium", "high"] as const;
export type FreeTimeEffort = (typeof FREE_TIME_EFFORTS)[number];

export type SurfaceContext =
  | { type: "focus" }
  | { type: "schedule"; date: string }
  | {
      type: "free-time";
      minutes: number;
      effort: FreeTimeEffort | null;
    };

export type ParsedChatRequest = {
  message: string;
  surface: ChatSurface | null;
  surface_context: SurfaceContext | null;
  session_id: string | null;
  turn_id: string;
};

function parseSurfaceContext(
  value: unknown,
): { ok: true; value: SurfaceContext | null } | { ok: false } {
  if (value == null) return { ok: true, value: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false };
  }
  const context = value as Record<string, unknown>;
  const keys = Object.keys(context);
  if (context.type === "focus" && keys.length === 1) {
    return { ok: true, value: { type: "focus" } };
  }
  if (
    context.type === "schedule" &&
    keys.length === 2 &&
    isValidScheduleDate(context.date)
  ) {
    return { ok: true, value: { type: "schedule", date: context.date } };
  }
  if (
    context.type === "free-time" &&
    keys.every((key) => ["type", "minutes", "effort"].includes(key)) &&
    keys.includes("minutes") &&
    Number.isInteger(context.minutes) &&
    Number(context.minutes) >= 1 &&
    Number(context.minutes) <= 480 &&
    (context.effort == null ||
      (typeof context.effort === "string" &&
        (FREE_TIME_EFFORTS as readonly string[]).includes(context.effort)))
  ) {
    return {
      ok: true,
      value: {
        type: "free-time",
        minutes: Number(context.minutes),
        effort: (context.effort as FreeTimeEffort | null | undefined) ?? null,
      },
    };
  }
  return { ok: false };
}

export function parseChatRequest(
  body: unknown,
):
  | { ok: true; request: ParsedChatRequest }
  | { ok: false; status: number; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "ההודעה ריקה." };
  }

  const raw = body as {
    message?: unknown;
    surface?: unknown;
    surface_context?: unknown;
    session_id?: unknown;
    turn_id?: unknown;
  };
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (!message) return { ok: false, status: 400, error: "ההודעה ריקה." };
  if (message.length > 8000) {
    return { ok: false, status: 400, error: "ההודעה ארוכה מדי." };
  }
  if (raw.turn_id != null && !isSessionId(raw.turn_id)) {
    return { ok: false, status: 400, error: "מזהה ה-Turn אינו תקין." };
  }
  const turn_id =
    typeof raw.turn_id === "string" ? raw.turn_id : crypto.randomUUID();

  let session_id: string | null = null;
  if (raw.session_id != null && raw.session_id !== "") {
    if (!isSessionId(raw.session_id)) {
      return { ok: false, status: 400, error: "שיחת היעד אינה תקינה." };
    }
    session_id = raw.session_id;
  }

  if (raw.surface == null || raw.surface === "") {
    const context = parseSurfaceContext(raw.surface_context);
    if (!context.ok || context.value) {
      return { ok: false, status: 400, error: "הקשר המשטח אינו תקין." };
    }
    return {
      ok: true,
      request: {
        message,
        surface: null,
        surface_context: null,
        session_id,
        turn_id,
      },
    };
  }
  if (!isChatSurface(raw.surface)) {
    return { ok: false, status: 400, error: "סוג המשטח אינו תקין." };
  }
  const context = parseSurfaceContext(raw.surface_context);
  if (!context.ok || !context.value) {
    return { ok: false, status: 400, error: "הקשר המשטח אינו תקין." };
  }
  const expectedType = raw.surface === "forgotten" ? "focus" : raw.surface;
  if (context.value.type !== expectedType) {
    return { ok: false, status: 400, error: "הקשר המשטח אינו תואם." };
  }
  return {
    ok: true,
    request: {
      message,
      surface: raw.surface === "forgotten" ? "focus" : raw.surface,
      surface_context: context.value,
      session_id,
      turn_id,
    },
  };
}
