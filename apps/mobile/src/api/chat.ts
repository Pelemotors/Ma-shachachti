import { apiRequest } from "./client";

export type MobileChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

export type ChatSessionSummary = {
  id: string;
  created_at: string;
  last_message_at: string;
  message_count: number;
  preview: string;
};

export async function loadChat(sessionId?: string) {
  const suffix = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  return apiRequest<{
    messages: MobileChatMessage[];
    session_id: string;
  }>(`/api/chat${suffix}`);
}

export async function listChatSessions() {
  return apiRequest<{
    sessions: ChatSessionSummary[];
    total: number;
    has_more: boolean;
  }>("/api/chat/sessions?limit=20");
}

export async function createChatSession() {
  return apiRequest<{ session_id: string; created_at: string }>("/api/chat/session", {
    method: "POST",
  });
}

export async function sendChat(message: string, sessionId?: string | null, turnId?: string) {
  return apiRequest<{
    reply: string;
    id?: string;
    created_at?: string;
    session_id: string;
    tasks?: unknown;
    mutations?: { ok: number; failed: number };
  }>("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      session_id: sessionId ?? undefined,
      turn_id: turnId,
    }),
  });
}
