export const ADMIN_DIAGNOSTIC_CHECKS = [
  "database",
  "auth",
  "admin-apis",
  "openai",
  "storage",
  "push-reminders",
  "full-health",
  "unit-tests",
  "playwright",
] as const;

export type AdminDiagnosticCheck = (typeof ADMIN_DIAGNOSTIC_CHECKS)[number];
export type DiagnosticStatus = "pass" | "fail" | "partial" | "not_configured";

export type DiagnosticResult = {
  check: AdminDiagnosticCheck;
  status: DiagnosticStatus;
  summary: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  warnings: string[];
  details?: Record<string, unknown>;
};

export type AdminApiCheckResponse = {
  name: string;
  status: number;
  ok: boolean;
};

export function isAdminDiagnosticCheck(
  value: string,
): value is AdminDiagnosticCheck {
  return ADMIN_DIAGNOSTIC_CHECKS.includes(value as AdminDiagnosticCheck);
}

export function summarizeAdminApiResponses(responses: AdminApiCheckResponse[]) {
  const failures = responses.filter((response) => !response.ok);
  return {
    status: failures.length ? ("fail" as const) : ("pass" as const),
    summary: failures.length
      ? `${failures.length} ממשקי Admin החזירו שגיאה.`
      : "כל ממשקי Admin המרכזיים הגיבו בהצלחה.",
    failures: failures.length,
  };
}
