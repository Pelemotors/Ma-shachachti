export const validationStatuses = ["PASS", "FAIL", "SKIP", "NOT_APPLICABLE"] as const;

export type ValidationResult = {
  validatorId: string;
  category: "invariants" | "agent" | "planning" | "state" | "privacy" | "ux" | "engine";
  severity: "info" | "warning" | "error" | "fatal";
  status: (typeof validationStatuses)[number];
  message: string;
  evidence: Record<string, unknown>;
  relatedActionIds: string[];
};
