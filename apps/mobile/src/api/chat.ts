import { apiRequest } from "./client";

export type MobileChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export async function loadChat(sessionId?: string) {
  const suffix = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  return apiRequest<{
    messages: MobileChatMessage[];
    session_id: string;
  }>(`/api/chat${suffix}`);
}

export async function sendChat(message: string, sessionId?: string | null) {
  return apiRequest<{
    reply: string;
    session_id: string;
  }>("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      session_id: sessionId ?? undefined,
    }),
  });
}
