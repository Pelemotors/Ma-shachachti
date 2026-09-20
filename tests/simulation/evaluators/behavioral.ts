import type { Evaluator } from "./index.ts";

export const behavioralEvaluator: Evaluator = {
  id: "behavioral",
  evaluate({ timeline }) {
    return {
      failedActionCount: timeline.filter((row) => row.status === "FAIL" || row.status === "ERROR")
        .length,
      recoveryCount: 0,
      userCorrectionCount: 0,
    };
  },
};
