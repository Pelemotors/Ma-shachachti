import type { Scorecard } from "../schemas/report.schema.ts";
import type { TimelineEntry } from "../schemas/report.schema.ts";

export type EvaluationInput = {
  timeline: TimelineEntry[];
};

export type Evaluator = {
  id: string;
  evaluate(input: EvaluationInput): Partial<Scorecard>;
};

export function emptyScorecard(): Scorecard {
  return {
    clarificationCount: 0,
    confirmationCount: 0,
    repeatedSuggestionCount: 0,
    unnecessaryReplanCount: 0,
    failedActionCount: 0,
    recoveryCount: 0,
    userCorrectionCount: 0,
    frictionEvents: 0,
    duplicateSuggestionCount: 0,
    staleStateCount: 0,
  };
}

export function mergeScorecards(parts: Partial<Scorecard>[]): Scorecard {
  const out = emptyScorecard();
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (typeof value === "number") {
        (out as Record<string, number>)[key] =
          ((out as Record<string, number>)[key] ?? 0) + value;
      }
    }
  }
  return out;
}
