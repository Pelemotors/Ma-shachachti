export const CHAT_DRAFT_PREFIX = "ma-shachachti-chat-draft:";

export function chatDraftKey(userId: string, sessionId: string | null) {
  return `${CHAT_DRAFT_PREFIX}${userId}:${sessionId ?? "pending"}`;
}

function safeStorage(store?: Storage | null) {
  if (store) return store;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readChatDraft(
  userId: string,
  sessionId: string | null,
  store?: Storage | null,
) {
  const storage = safeStorage(store);
  if (!storage || !userId) return "";
  try {
    return storage.getItem(chatDraftKey(userId, sessionId)) ?? "";
  } catch {
    return "";
  }
}

export function writeChatDraft(
  userId: string,
  sessionId: string | null,
  value: string,
  store?: Storage | null,
) {
  const storage = safeStorage(store);
  if (!storage || !userId) return;
  try {
    const key = chatDraftKey(userId, sessionId);
    if (value) storage.setItem(key, value);
    else storage.removeItem(key);
  } catch {
    /* draft persistence is best effort */
  }
}
