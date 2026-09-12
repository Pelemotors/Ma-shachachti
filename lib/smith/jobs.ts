export const DEFAULT_MAX_AUTONOMOUS_ITERATIONS = 3;

export type SmithJobInput = {
  jobType: string;
  workItemId?: string | null;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
  maxAttempts?: number;
  scheduledAt?: string;
};

export function validateSmithJob(input: SmithJobInput) {
  if (!/^[a-z][a-z0-9_.-]+$/.test(input.jobType)) {
    throw new Error("Invalid Smith job type.");
  }
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) {
    throw new Error("Invalid Smith job idempotency key.");
  }
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_AUTONOMOUS_ITERATIONS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw new Error("Smith job max attempts must be between 1 and 20.");
  }
  if (input.scheduledAt && Number.isNaN(Date.parse(input.scheduledAt))) {
    throw new Error("Invalid Smith job schedule.");
  }
  return {
    job_type: input.jobType,
    work_item_id: input.workItemId ?? null,
    payload: input.payload ?? {},
    idempotency_key: input.idempotencyKey,
    max_attempts: maxAttempts,
    scheduled_at: input.scheduledAt ?? new Date().toISOString(),
  };
}

export function retryDelayMs(attempt: number) {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error("Attempt must be a positive integer.");
  }
  return Math.min(15 * 60_000, 5_000 * 2 ** (attempt - 1));
}
