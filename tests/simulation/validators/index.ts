import type { ValidationResult } from "../schemas/validation.schema.ts";
import type { RunContext } from "../runner/run-context.ts";
import type { TimelineEntry } from "../schemas/report.schema.ts";
import type { SimulationSnapshot } from "../schemas/snapshot.schema.ts";

export type ValidatorWhen = "after_action" | "end_of_day" | "end_of_run";

export type ValidatorContext = {
  run: RunContext;
  timeline: TimelineEntry[];
  snapshots: SimulationSnapshot[];
  lastEntry?: TimelineEntry;
};

export type SimulationValidator = {
  id: string;
  category: ValidationResult["category"];
  severity: ValidationResult["severity"];
  when: ValidatorWhen;
  validate(context: ValidatorContext): ValidationResult;
};

export function result(
  validator: SimulationValidator,
  status: ValidationResult["status"],
  message: string,
  extra: Partial<ValidationResult> = {},
): ValidationResult {
  return {
    validatorId: validator.id,
    category: validator.category,
    severity: validator.severity,
    status,
    message,
    evidence: extra.evidence ?? {},
    relatedActionIds: extra.relatedActionIds ?? [],
  };
}

export function runValidators(
  validators: SimulationValidator[],
  when: ValidatorWhen,
  context: ValidatorContext,
): ValidationResult[] {
  return validators
    .filter((validator) => validator.when === when)
    .map((validator) => validator.validate(context));
}
