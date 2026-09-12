import { evaluateSmithCapability } from "./capabilities.ts";
import { DEFAULT_MAX_AUTONOMOUS_ITERATIONS } from "./jobs.ts";
import type { SmithWorkItemStatus } from "./types.ts";

export type SmithOrchestratorInput = {
  status: SmithWorkItemStatus;
  iteration: number;
  hasDiagnosis: boolean;
  exactSha: string | null;
  testsPassed: boolean;
  previewReady: boolean;
  context: Parameters<typeof evaluateSmithCapability>[1];
};

export type SmithNextAction =
  | "investigate"
  | "build"
  | "run_tests"
  | "deploy_preview"
  | "request_admin_approval"
  | "wait_for_admin"
  | "stop";

export function chooseSmithNextAction(input: SmithOrchestratorInput): {
  action: SmithNextAction;
  reason: string;
} {
  if (input.iteration >= DEFAULT_MAX_AUTONOMOUS_ITERATIONS) {
    return { action: "stop", reason: "Maximum autonomous iterations reached." };
  }

  if (!input.hasDiagnosis) {
    return { action: "investigate", reason: "A diagnosis is required." };
  }

  if (!input.exactSha) {
    const decision = evaluateSmithCapability(
      "edit_preview_code",
      input.context,
    );
    return decision.allowed
      ? { action: "build", reason: "No implementation SHA exists." }
      : {
          action: "stop",
          reason: decision.reason ?? "Build capability denied.",
        };
  }

  if (!input.testsPassed) {
    const decision = evaluateSmithCapability("run_tests", input.context);
    return decision.allowed
      ? { action: "run_tests", reason: "Tests have not passed for the SHA." }
      : {
          action: "stop",
          reason: decision.reason ?? "Test capability denied.",
        };
  }

  if (!input.previewReady) {
    const decision = evaluateSmithCapability("deploy_preview", input.context);
    return decision.allowed
      ? { action: "deploy_preview", reason: "A tested Preview is required." }
      : {
          action: "stop",
          reason: decision.reason ?? "Preview capability denied.",
        };
  }

  if (input.status === "preview_ready") {
    return {
      action: "request_admin_approval",
      reason: "Exact-SHA Preview and tests are ready for Admin review.",
    };
  }

  if (["approval_requested", "approved"].includes(input.status)) {
    return {
      action: "wait_for_admin",
      reason: "Smith stops at the external approval boundary.",
    };
  }

  return { action: "stop", reason: "No registered action for this state." };
}
