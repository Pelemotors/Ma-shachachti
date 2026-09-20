import type { Evaluator } from "./index.ts";

export const regressionEvaluator: Evaluator = {
  id: "regression",
  evaluate() {
    return { staleStateCount: 0 };
  },
};
