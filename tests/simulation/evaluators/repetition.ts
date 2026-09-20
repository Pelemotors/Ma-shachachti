import type { Evaluator } from "./index.ts";

export const repetitionEvaluator: Evaluator = {
  id: "repetition",
  evaluate() {
    return {
      repeatedSuggestionCount: 0,
      duplicateSuggestionCount: 0,
    };
  },
};
