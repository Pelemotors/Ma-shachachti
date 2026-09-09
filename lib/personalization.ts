import { AppState } from "./model";

/**
 * Trim older chat messages for token limits.
 * Meaning classification (facts/preferences/rules) is the agent's job — not keyword buckets.
 */
export function compactConversation(
  state: AppState,
  now = new Date(),
): AppState {
  const recent = state.messages.slice(-12);
  const older = state.messages.slice(
    0,
    Math.max(0, state.messages.length - 12),
  );
  if (!older.length) return state;

  return {
    ...state,
    messages: recent,
    compactedMemory: {
      ...state.compactedMemory,
      updatedAt: now.toISOString(),
    },
  };
}

export function upsertLearningInsight(
  state: AppState,
  insight: AppState["learning"][number],
): AppState {
  const existing = state.learning.find(
    (x) => x.kind === insight.kind && x.key === insight.key,
  );
  if (!existing) {
    return { ...state, learning: [insight, ...state.learning].slice(0, 300) };
  }
  return {
    ...state,
    learning: state.learning.map((x) =>
      x.id === existing.id
        ? {
            ...x,
            samples: x.samples + 1,
            payload: insight.payload,
            confidence:
              x.samples + 1 >= 5
                ? "high"
                : x.samples + 1 >= 2
                  ? "medium"
                  : "low",
            lastObservedAt: insight.lastObservedAt,
          }
        : x,
    ),
  };
}
