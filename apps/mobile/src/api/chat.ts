import { apiRequest } from "./client";

/** Agent chat will use this module in a later phase — not wired to UI yet. */
export async function postChatStub(message: string) {
  return apiRequest("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}
