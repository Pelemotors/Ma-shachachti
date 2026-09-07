import { randomUUID } from "node:crypto";
import type { AppState, Task } from "../../model";

export type DurationSample = {
  minutes: number;
  at: string;
  source: "user_report" | "completion";
};

export type DurationModel = {
  samples: number[];
  typicalMinutes: number | null;
  variance: number | null;
  count: number;
  confidence: "low" | "medium" | "high";
  lastUpdatedAt: string | null;
  source: "learned" | "explicit" | "default";
};

/** Single occurrence must not rewrite the model. */
export const MIN_DURATION_SAMPLES = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function varianceOf(values: number[], center: number): number {
  if (values.length < 2) return 0;
  const sum = values.reduce((a, v) => a + (v - center) ** 2, 0);
  return sum / values.length;
}

/**
 * Deterministic personal-pace update from structured duration samples.
 * Explicit user report beats inferred completion when both exist in one batch.
 */
export function updateDurationModel(
  previous: DurationModel | null,
  sample: DurationSample,
  opts: { explicit?: boolean } = {},
): DurationModel {
  const prior = previous?.samples ?? [];
  const samples = [...prior, sample.minutes].slice(-30);
  const count = samples.length;
  if (count < MIN_DURATION_SAMPLES) {
    return {
      samples,
      typicalMinutes: null,
      variance: null,
      count,
      confidence: "low",
      lastUpdatedAt: sample.at,
      source: opts.explicit ? "explicit" : "learned",
    };
  }
  const typicalMinutes = median(samples);
  const variance = varianceOf(samples, typicalMinutes);
  return {
    samples,
    typicalMinutes,
    variance,
    count,
    confidence: count >= 8 && variance < typicalMinutes * 0.4 ? "high" : "medium",
    lastUpdatedAt: sample.at,
    source: opts.explicit ? "explicit" : previous?.source === "explicit" ? "explicit" : "learned",
  };
}

export function recordTaskDurationSample(
  state: AppState,
  task: Task,
  minutes: number,
  now = new Date(),
  opts: { explicit?: boolean } = {},
): AppState {
  const key = `duration:${task.detailTypeId ?? task.categoryId}:${task.title}`;
  const existing = state.learning.find(
    (x) => x.kind === "duration" && x.key === key,
  );
  const previous: DurationModel | null = existing
    ? {
        samples: Array.isArray(existing.payload.samples)
          ? (existing.payload.samples as number[])
          : [],
        typicalMinutes:
          typeof existing.payload.typicalMinutes === "number"
            ? existing.payload.typicalMinutes
            : null,
        variance:
          typeof existing.payload.variance === "number"
            ? existing.payload.variance
            : null,
        count: existing.samples,
        confidence: existing.confidence,
        lastUpdatedAt: existing.lastObservedAt,
        source:
          existing.payload.source === "explicit" ? "explicit" : "learned",
      }
    : null;

  if (previous?.source === "explicit" && !opts.explicit) {
    // Explicit beats learned — ignore weak inferred sample.
    return state;
  }

  const model = updateDurationModel(
    previous,
    { minutes, at: now.toISOString(), source: opts.explicit ? "user_report" : "completion" },
    opts,
  );

  const insight = {
    id: existing?.id ?? randomUUID(),
    kind: "duration" as const,
    key,
    payload: { ...model },
    samples: model.count,
    confidence: model.confidence,
    lastObservedAt: now.toISOString(),
  };

  if (!existing) {
    return { ...state, learning: [insight, ...state.learning].slice(0, 300) };
  }
  return {
    ...state,
    learning: state.learning.map((x) => (x.id === existing.id ? insight : x)),
  };
}

export function learnedDurationMinutes(
  state: AppState,
  task: Task,
): number | null {
  const key = `duration:${task.detailTypeId ?? task.categoryId}:${task.title}`;
  const hit = state.learning.find((x) => x.kind === "duration" && x.key === key);
  if (!hit || hit.samples < MIN_DURATION_SAMPLES) return null;
  const typical = hit.payload.typicalMinutes;
  return typeof typical === "number" ? typical : null;
}
