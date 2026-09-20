import type { Evaluator } from "./index.ts";

export const frictionEvaluator: Evaluator = {
  id: "friction",
  evaluate() {
    return {
      frictionEvents: 0,
      clarificationCount: 0,
      confirmationCount: 0,
    };
  },
};
