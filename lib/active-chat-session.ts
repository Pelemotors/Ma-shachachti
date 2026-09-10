import { isSessionId } from "./chat-sessions.ts";

export const ACTIVE_CHAT_STORAGE_PREFIX = "ma-shachachti-active-chat:";

export function activeChatStorageKey(userId: string) {
  return `${ACTIVE_CHAT_STORAGE_PREFIX}${userId}`;
}

function memoryStore(store?: Storage | null) {
  if (store) return store;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readActiveChatSession(
  userId: string,
  store?: Storage | null,
) {
  const storage = memoryStore(store);
  if (!storage || !userId) return null;
  try {
    const value = storage.getItem(activeChatStorageKey(userId));
    return isSessionId(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeActiveChatSession(
  userId: string,
  sessionId: string,
  store?: Storage | null,
) {
  const storage = memoryStore(store);
  if (!storage || !userId || !isSessionId(sessionId)) return;
  try {
    storage.setItem(activeChatStorageKey(userId), sessionId);
  } catch {
    /* preference only */
  }
}

export function clearActiveChatSession(userId: string, store?: Storage | null) {
  const storage = memoryStore(store);
  if (!storage || !userId) return;
  try {
    storage.removeItem(activeChatStorageKey(userId));
  } catch {
    /* preference only */
  }
}

export function storedSessionNeedsFallback(status: number) {
  return status === 400 || status === 403 || status === 404;
}
