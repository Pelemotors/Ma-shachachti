import { isChatSurface, type ChatSurface } from "./home-surfaces.ts";
import { isSessionId } from "./chat-sessions.ts";

export type ParsedChatRequest = {
  message: string;
  surface: ChatSurface | null;
  session_id: string | null;
};

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
    session_id?: unknown;
  };
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (!message) return { ok: false, status: 400, error: "ההודעה ריקה." };
  if (message.length > 8000) {
    return { ok: false, status: 400, error: "ההודעה ארוכה מדי." };
  }

  let session_id: string | null = null;
  if (raw.session_id != null && raw.session_id !== "") {
    if (!isSessionId(raw.session_id)) {
      return { ok: false, status: 400, error: "שיחת היעד אינה תקינה." };
    }
    session_id = raw.session_id;
  }

  if (raw.surface == null || raw.surface === "") {
    return { ok: true, request: { message, surface: null, session_id } };
  }
  if (!isChatSurface(raw.surface)) {
    return { ok: false, status: 400, error: "סוג המשטח אינו תקין." };
  }
  return { ok: true, request: { message, surface: raw.surface, session_id } };
}
