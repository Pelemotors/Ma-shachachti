"use client";

import type {
  AdminDiagnosticCheck,
  DiagnosticResult,
} from "@/lib/admin-diagnostic-contract";

const checks: Array<{
  check: AdminDiagnosticCheck;
  label: string;
  description: string;
}> = [
  {
    check: "database",
    label: "Database",
    description: "שאילתה אמיתית ו-latency",
  },
  { check: "auth", label: "Auth", description: "אימות חשבון Admin נוכחי" },
  {
    check: "admin-apis",
    label: "Admin APIs",
    description: "Overview, Health, Activity, AI, Incidents, Tasks, Users",
  },
  { check: "openai", label: "OpenAI", description: "מפתח ומודל בפועל" },
  { check: "storage", label: "Storage", description: "bucket פרטי ללא כתיבה" },
  {
    check: "push-reminders",
    label: "Push / Reminders",
    description: "הגדרות וריצה אחרונה",
  },
  {
    check: "full-health",
    label: "הרץ את כל הבדיקות",
    description: "Application, DB, Auth, APIs, AI, Storage ו-Push",
  },
  {
    check: "unit-tests",
    label: "Test Suite",
    description: "Local development בלבד",
  },
  {
    check: "playwright",
    label: "Playwright",
    description: "Local development בלבד",
  },
];

export function OperationalDiagnosticsPanel({
  running,
  results,
  onRun,
}: {
  running: { check: AdminDiagnosticCheck; startedAt: string } | null;
  results: Partial<Record<AdminDiagnosticCheck, DiagnosticResult>>;
  onRun: (check: AdminDiagnosticCheck) => void;
}) {
  return (
    <section className="smith-card control-diagnostics" id="system-checks">
      <div className="smith-panel-heading">
        <div>
          <h2>בדיקות מערכת</h2>
          <p>כל בדיקה מחזירה evidence מובנה; אין כאן פעולה של Smith.</p>
        </div>
        <span className="smith-status-chip">OPERATIONAL ADMIN TOOLS</span>
      </div>
      <div className="diagnostic-grid">
        {checks.map((item) => {
          const diagnostic = results[item.check];
          const isRunning = running?.check === item.check;
          return (
            <article
              key={item.check}
              data-status={
                isRunning ? "running" : (diagnostic?.status ?? "idle")
              }
            >
              <div className="diagnostic-card-head">
                <strong>{item.label}</strong>
                <span>
                  {diagnostic ? statusLabel(diagnostic.status) : "לא הורץ"}
                </span>
              </div>
              <small>{item.description}</small>
              {isRunning ? (
                <div className="diagnostic-running" role="status">
                  <i />
                  <span>הבדיקה פועלת מאז</span>
                  <time>
                    {new Date(running.startedAt).toLocaleTimeString("he-IL")}
                  </time>
                </div>
              ) : diagnostic ? (
                <div className="diagnostic-result" role="status">
                  <strong>{diagnostic.summary}</strong>
                  <time dateTime={diagnostic.completedAt}>
                    {new Date(diagnostic.completedAt).toLocaleString("he-IL")}
                    {" · "}
                    {diagnostic.durationMs}ms
                  </time>
                  {diagnostic.warnings.length > 0 && (
                    <ul className="diagnostic-warnings">
                      {diagnostic.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                  {diagnostic.details && (
                    <details>
                      <summary>פרטים טכניים</summary>
                      <pre dir="ltr">
                        {JSON.stringify(diagnostic.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ) : (
                <p className="diagnostic-last-run">אין תוצאה בסשן הנוכחי.</p>
              )}
              <button
                className="diagnostic-run-button"
                onClick={() => onRun(item.check)}
                disabled={running !== null}
                aria-busy={isRunning}
              >
                {isRunning
                  ? "מריץ…"
                  : diagnostic
                    ? "הרץ שוב"
                    : item.check === "full-health"
                      ? "הרץ הכול"
                      : "הרץ בדיקה"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function statusLabel(status: DiagnosticResult["status"]) {
  return {
    pass: "PASS",
    fail: "FAIL",
    partial: "PARTIAL",
    not_configured: "NOT CONFIGURED",
  }[status];
}
