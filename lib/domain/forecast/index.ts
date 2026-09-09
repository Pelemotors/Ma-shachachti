import type { AppState } from "../../model";

export type ForecastEventType = "replenishment" | "depletion" | "correction";

export type ForecastEvent = {
  subject: string;
  type: ForecastEventType;
  occurredAt: string;
  evidence?: string | null;
};

/** Legacy shape kept for type compatibility. Production no longer surfaces it. */
export type ForecastModel = {
  id: string;
  subject: string;
  type: "consumption" | "household_recurrence";
  expectedWindowStart: string | null;
  expectedWindowEnd: string | null;
  confidence: number;
  evidenceCount: number;
  lastEventAt: string | null;
  learnedIntervalDays: number | null;
  source: "learned" | "explicit";
  status: "active" | "weak" | "cancelled";
  recheckAt: string | null;
  expiresAt: string | null;
};

/**
 * Semantic interval/confidence/window reasoning is disconnected from
 * Production prediction. The LLM decides what may need attention.
 * Code may only record factual events.
 */
export const OLD_FORECAST_REASONING_PATH = "DISCONNECTED" as const;

function factualPayload(
  events: ForecastEvent[],
  event: ForecastEvent,
): Record<string, unknown> {
  return {
    events: events.slice(-30),
    subject: event.subject,
    lastEventAt: event.occurredAt,
    source: event.type === "correction" ? "explicit" : "recorded",
    status: event.type === "correction" ? "cancelled" : "recorded",
  };
}

/** Append a factual inventory event. Does not compute windows, scores, or due predictions. */
export function applyForecastEvent(
  state: AppState,
  event: ForecastEvent,
): AppState {
  const key = `forecast:${event.subject.toLowerCase()}`;
  const existing = state.learning.find(
    (x) => x.kind === "forecast" && x.key === key,
  );
  const history = Array.isArray(existing?.payload.events)
    ? ([...(existing!.payload.events as ForecastEvent[])] as ForecastEvent[])
    : [];
  if (event.type !== "correction") history.push(event);

  const insight = {
    id: existing?.id ?? crypto.randomUUID(),
    kind: "forecast" as const,
    key,
    payload: factualPayload(history, event),
    samples: history.length,
    confidence: "low" as const,
    lastObservedAt: event.occurredAt,
  };

  if (!existing)
    return { ...state, learning: [insight, ...state.learning].slice(0, 300) };
  return {
    ...state,
    learning: state.learning.map((x) => (x.id === existing.id ? insight : x)),
  };
}

/** Disconnected: never expose a code-decided semantic forecast. */
export function activeForecasts(_state: AppState): ForecastModel[] {
  return [];
}

/** Disconnected: code must not decide that a forecast is actionable. */
export function forecastActionableNow(
  _forecast: ForecastModel,
  _now = new Date(),
  _leadDays = 5,
): boolean {
  return false;
}
