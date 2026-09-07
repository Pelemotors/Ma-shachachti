import { AppState } from "./model";

/**
 * Compact older chat into durable memory slots without storing every sentence.
 */
export function compactConversation(
  state: AppState,
  now = new Date(),
): AppState {
  const stamp = now.toISOString();
  const recent = state.messages.slice(-12);
  const older = state.messages.slice(
    0,
    Math.max(0, state.messages.length - 12),
  );
  if (!older.length) return state;

  const facts = [...state.compactedMemory.facts];
  const preferences = [...state.compactedMemory.preferences];
  const patterns = [...state.compactedMemory.patterns];

  for (const msg of older) {
    if (msg.role !== "user") continue;
    const text = msg.text.trim();
    if (text.length < 8 || text.length > 200) continue;
    if (/^(היי|שלום|תודה|אוקיי|כן|לא)\b/.test(text)) continue;
    if (/מעדיפ|אוהב|לא אוהב|תמיד|בדרך כלל/.test(text)) {
      if (!preferences.includes(text)) preferences.unshift(text);
    } else if (/צריך|חייבת|תזכיר|תור|מחר|היום/.test(text)) {
      if (!facts.includes(text)) facts.unshift(text);
    } else if (/ביחד עם|אחרי ש|לפני ש/.test(text)) {
      if (!patterns.includes(text)) patterns.unshift(text);
    }
  }

  return {
    ...state,
    messages: recent,
    compactedMemory: {
      facts: facts.slice(0, 100),
      preferences: preferences.slice(0, 100),
      patterns: patterns.slice(0, 100),
      updatedAt: stamp,
      lifeAdminWindow: state.compactedMemory.lifeAdminWindow,
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
