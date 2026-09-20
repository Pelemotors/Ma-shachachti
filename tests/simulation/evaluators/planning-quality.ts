import type { Evaluator } from "./index.ts";

export const planningQualityEvaluator: Evaluator = {
  id: "planning-quality",
  evaluate() {
    return { unnecessaryReplanCount: 0 };
  },
};
