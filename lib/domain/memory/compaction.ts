import type { AppState } from "@/lib/model";

export const COMPACTION_MESSAGE_THRESHOLD = 30;

export function pendingCompactionMessages(state: AppState) {
  const cursorId = state.compactedMemory.compactedThroughMessageId;
  const cursorAt = state.compactedMemory.compactedThroughCreatedAt;
  return state.messages.filter((message) => {
    if (cursorId && message.id === cursorId) return false;
    if (cursorAt && message.createdAt <= cursorAt) return false;
    return true;
  });
}

export function shouldCompactMemory(state: AppState) {
  return pendingCompactionMessages(state).length >= COMPACTION_MESSAGE_THRESHOLD;
}

export function lastCompactedCursor(state: AppState) {
  const pending = pendingCompactionMessages(state);
  const last = state.messages[state.messages.length - 1];
  if (!last) {
    return {
      compactedThroughMessageId: state.compactedMemory.compactedThroughMessageId,
      compactedThroughCreatedAt: state.compactedMemory.compactedThroughCreatedAt,
    };
  }
  const edge = pending[pending.length - 1] ?? last;
  return {
    compactedThroughMessageId: edge.id,
    compactedThroughCreatedAt: edge.createdAt,
  };
}
