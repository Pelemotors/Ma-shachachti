import { randomUUID } from "node:crypto";
import type { AppState } from "../../model";

export type ForecastEventType = "replenishment" | "depletion" | "correction";

export type ForecastEvent = {
  subject: string;
  type: ForecastEventType;
  occurredAt: string;
  evidence?: string | null;
};

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

const MIN_EVIDENCE = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(b) - Date.parse(a)) / 86400000;
}

/**
 * Deterministic forecast from structured replenishment/depletion events.
 * LLM extracts events; this module computes interval/confidence/window.
 */
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

  if (event.type === "correction") {
    const insight = {
      id: existing?.id ?? randomUUID(),
      kind: "forecast" as const,
      key,
      payload: {
        events: history.slice(-20),
        status: "cancelled",
        confidence: 0,
        learnedIntervalDays: null,
        source: "explicit",
      },
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

  history.push(event);
  const stamps = history
    .filter((e) => e.type === "replenishment" || e.type === "depletion")
    .map((e) => e.occurredAt)
    .sort();
  const intervals: number[] = [];
  for (let i = 1; i < stamps.length; i++) {
    intervals.push(daysBetween(stamps[i - 1]!, stamps[i]!));
  }

  const evidenceCount = stamps.length;
  let learnedIntervalDays: number | null = null;
  let confidence = 0;
  let status: ForecastModel["status"] = "weak";
  let expectedWindowStart: string | null = null;
  let expectedWindowEnd: string | null = null;

  if (evidenceCount >= MIN_EVIDENCE && intervals.length >= 2) {
    learnedIntervalDays = median(intervals);
    const spread =
      Math.max(...intervals) - Math.min(...intervals);
    confidence = Math.max(
      0.2,
      Math.min(0.95, 0.35 + evidenceCount * 0.08 - spread / (learnedIntervalDays * 4)),
    );
    status = confidence >= 0.55 ? "active" : "weak";
    const last = Date.parse(stamps[stamps.length - 1]!);
    const start = last + learnedIntervalDays * 0.85 * 86400000;
    const end = last + learnedIntervalDays * 1.2 * 86400000;
    expectedWindowStart = new Date(start).toISOString();
    expectedWindowEnd = new Date(end).toISOString();
  }

  const insight = {
    id: existing?.id ?? randomUUID(),
    kind: "forecast" as const,
    key,
    payload: {
      events: history.slice(-30),
      subject: event.subject,
      type: "consumption",
      expectedWindowStart,
      expectedWindowEnd,
      confidence,
      evidenceCount,
      lastEventAt: event.occurredAt,
      learnedIntervalDays,
      source: "learned",
      status,
      recheckAt: expectedWindowStart,
      expiresAt: expectedWindowEnd,
    },
    samples: evidenceCount,
    confidence:
      confidence >= 0.7 ? ("high" as const) : confidence >= 0.4 ? ("medium" as const) : ("low" as const),
    lastObservedAt: event.occurredAt,
  };

  if (!existing)
    return { ...state, learning: [insight, ...state.learning].slice(0, 300) };
  return {
    ...state,
    learning: state.learning.map((x) => (x.id === existing.id ? insight : x)),
  };
}

export function activeForecasts(state: AppState): ForecastModel[] {
  return state.learning
    .filter((x) => x.kind === "forecast")
    .map((x) => {
      const p = x.payload;
      return {
        id: x.id,
        subject: String(p.subject ?? x.key.replace(/^forecast:/, "")),
        type: "consumption" as const,
        expectedWindowStart:
          typeof p.expectedWindowStart === "string" ? p.expectedWindowStart : null,
        expectedWindowEnd:
          typeof p.expectedWindowEnd === "string" ? p.expectedWindowEnd : null,
        confidence: typeof p.confidence === "number" ? p.confidence : 0,
        evidenceCount: x.samples,
        lastEventAt: typeof p.lastEventAt === "string" ? p.lastEventAt : null,
        learnedIntervalDays:
          typeof p.learnedIntervalDays === "number" ? p.learnedIntervalDays : null,
        source: p.source === "explicit" ? "explicit" : "learned",
        status:
          p.status === "active" || p.status === "cancelled" ? p.status : "weak",
        recheckAt: typeof p.recheckAt === "string" ? p.recheckAt : null,
        expiresAt: typeof p.expiresAt === "string" ? p.expiresAt : null,
      };
    })
    .filter((f) => f.status === "active" && f.confidence >= 0.55);
}

/** WhatForgot may surface a forecast only when proximate and confident. */
export function forecastActionableNow(
  forecast: ForecastModel,
  now = new Date(),
  leadDays = 5,
): boolean {
  if (forecast.status !== "active" || forecast.confidence < 0.55) return false;
  if (!forecast.expectedWindowStart) return false;
  const days =
    (Date.parse(forecast.expectedWindowStart) - now.getTime()) / 86400000;
  return days <= leadDays;
}
