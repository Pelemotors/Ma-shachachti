import { isChatSurface, type ChatSurface } from "./home-surfaces.ts";

export type ParsedChatRequest = {
  message: string;
  surface: ChatSurface | null;
};

export function parseChatRequest(
  body: unknown,
):
  | { ok: true; request: ParsedChatRequest }
  | { ok: false; status: number; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "ההודעה ריקה." };
  }

  const raw = body as { message?: unknown; surface?: unknown };
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (!message) return { ok: false, status: 400, error: "ההודעה ריקה." };
  if (message.length > 8000) {
    return { ok: false, status: 400, error: "ההודעה ארוכה מדי." };
  }

  if (raw.surface == null || raw.surface === "") {
    return { ok: true, request: { message, surface: null } };
  }
  if (!isChatSurface(raw.surface)) {
    return { ok: false, status: 400, error: "סוג המשטח אינו תקין." };
  }
  return { ok: true, request: { message, surface: raw.surface } };
}
