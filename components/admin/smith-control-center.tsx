"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import type {
  AdminDiagnosticCheck,
  DiagnosticResult,
} from "@/lib/admin-diagnostic-contract";
import type {
  SmithConnectionState,
  SmithDashboardData,
} from "@/lib/smith/types";

type LoadState = "loading" | "ready" | "unauthorized" | "forbidden" | "error";
type ActivityEvent = {
  id?: string;
  event_type: string;
  created_at: string;
  owner_id?: string | null;
  metadata?: Record<string, unknown> | null;
};
type AdminOverview = {
  stats: {
    users: number;
    approved: number;
    pending: number;
    active7: number;
    tasks: number;
    completed: number;
    ai7: number;
    aiAttempts7: number;
    aiFailures7: number;
    aiAverageLatencyMs: number | null;
    reminders7: number;
    reminderErrors: number;
  };
  recent: ActivityEvent[];
  generatedAt: string;
};
type AdminHealth = {
  database: "healthy" | "error";
  latencyMs: number;
  services: {
    supabase: boolean;
    openai: boolean;
    push: boolean;
    cron: boolean;
  };
  serviceDetails: Record<
    "supabase" | "openai" | "push" | "cron",
    {
      configured: boolean;
      status: string;
      lastTestedAt?: string | null;
      lastRunAt?: string | null;
    }
  >;
  checkedAt: string;
};
type AdminAi = {
  attempts: number;
  successes: number;
  failures: number;
  successRate: number | null;
  averageLatencyMs: number | null;
  failureCodes: Record<string, number>;
  lastTestedAt: string | null;
};
type AdminTasks = { total: number; byStatus: Record<string, number> };
type AdminUsers = {
  users: Array<{
    id: string;
    role: "user" | "admin";
    approved: boolean;
  }>;
};
type TestEvidence = {
  phase1a?: {
    status: string;
    environment: string;
    generatedAt: string;
    productionConnected: boolean;
  };
  playwright?: {
    status: string;
    environment: string;
    executedAt: string;
    results: { passed: number; skipped: number; failed: number };
    sourceState: string;
    approvalEvidence: boolean;
  };
};
type ControlCenterData = {
  overview: AdminOverview;
  health: AdminHealth | null;
  ai: AdminAi | null;
  tasks: AdminTasks | null;
  users: AdminUsers | null;
  activity: ActivityEvent[];
  smith: SmithDashboardData | null;
  evidence: TestEvidence | null;
};

const navigation = [
  ["סקירה תפעולית", "/admin/smith", "events"],
  ["אירועים ותקלות", "/admin/smith/events", "events"],
  ["בדיקות מערכת", "/admin/smith/tests", "tests"],
  ["Audit", "/admin/smith/audit", "audit"],
  ["Setup", "/admin/smith/setup", "setup"],
] as const;

const diagnosticButtons: Array<{
  check: AdminDiagnosticCheck;
  label: string;
  description: string;
}> = [
  {
    check: "database",
    label: "בדוק Database",
    description: "שאילתה אמיתית ו-latency",
  },
  { check: "auth", label: "בדוק Auth", description: "אימות חשבון Admin נוכחי" },
  {
    check: "admin-apis",
    label: "בדוק Admin APIs",
    description: "ששת הממשקים הקיימים",
  },
  { check: "openai", label: "בדוק OpenAI", description: "מפתח ומודל בפועל" },
  {
    check: "storage",
    label: "בדוק Storage",
    description: "bucket פרטי ללא כתיבה",
  },
  {
    check: "push-reminders",
    label: "בדוק Push / Reminders",
    description: "הגדרות וריצה אחרונה",
  },
  {
    check: "full-health",
    label: "Health Check מלא",
    description: "כל הבדיקות הבטוחות",
  },
  {
    check: "unit-tests",
    label: "הרץ Test Suite",
    description: "Local development בלבד",
  },
  {
    check: "playwright",
    label: "הרץ Playwright",
    description: "Local development בלבד",
  },
];

const connectionLabels: Record<SmithConnectionState, string> = {
  connected: "מחובר",
  disconnected: "לא מחובר",
  partial: "חלקי",
  blocked: "חסום",
  not_configured: "לא הוגדר",
  local_only: "מקומי בלבד",
};

async function getAdminToken() {
  const sessionResult = await Promise.race([
    supabase?.auth.getSession(),
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), 1_500);
    }),
  ]);
  return sessionResult?.data.session?.access_token ?? null;
}

async function fetchAdminResource(path: string, token: string | null) {
  return fetch(path, {
    cache: "no-store",
    headers: { Authorization: token ? `Bearer ${token}` : "" },
  });
}

export function SmithControlCenter() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<ControlCenterData | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [runningCheck, setRunningCheck] = useState<AdminDiagnosticCheck | null>(
    null,
  );
  const [diagnostics, setDiagnostics] = useState<
    Partial<Record<AdminDiagnosticCheck, DiagnosticResult>>
  >({});

  async function load() {
    setState("loading");
    try {
      const token = await getAdminToken();
      const paths = [
        "/api/admin/overview",
        "/api/admin/health",
        "/api/admin/ai",
        "/api/admin/tasks",
        "/api/admin/users",
        "/api/admin/activity?limit=30",
        "/api/admin/smith/overview",
        "/api/admin/diagnostics/evidence",
      ] as const;
      const responses = await Promise.all(
        paths.map((path) => fetchAdminResource(path, token)),
      );
      const byPath = new Map(
        paths.map((path, index) => [path, responses[index]]),
      );
      const usersResponse = byPath.get("/api/admin/users")!;
      if (usersResponse.status === 401) return setState("unauthorized");
      if (usersResponse.status === 403) return setState("forbidden");
      const overviewResponse = byPath.get("/api/admin/overview")!;
      if (!overviewResponse.ok) return setState("error");

      const optionalJson = async <T,>(path: (typeof paths)[number]) => {
        const response = byPath.get(path);
        return response?.ok ? ((await response.json()) as T) : null;
      };
      const overview = (await overviewResponse.json()) as AdminOverview;
      const health = await optionalJson<AdminHealth>("/api/admin/health");
      const ai = await optionalJson<AdminAi>("/api/admin/ai");
      const tasks = await optionalJson<AdminTasks>("/api/admin/tasks");
      const users = await optionalJson<AdminUsers>("/api/admin/users");
      const activityResponse = await optionalJson<{ events: ActivityEvent[] }>(
        "/api/admin/activity?limit=30",
      );
      const smith = await optionalJson<SmithDashboardData>(
        "/api/admin/smith/overview",
      );
      const evidence = await optionalJson<TestEvidence>(
        "/api/admin/diagnostics/evidence",
      );
      setData({
        overview,
        health,
        ai,
        tasks,
        users,
        activity: activityResponse?.events ?? [],
        smith,
        evidence,
      });
      setState("ready");
    } catch {
      setState("error");
    }
  }

  async function runDiagnostic(check: AdminDiagnosticCheck) {
    setRunningCheck(check);
    try {
      const token = await getAdminToken();
      const response = await fetch(`/api/admin/diagnostics/${check}`, {
        method: "POST",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      const payload = await response.json();
      if (!response.ok) {
        setDiagnostics((current) => ({
          ...current,
          [check]: {
            check,
            status: "failed",
            summary: payload.error ?? "הבדיקה נכשלה.",
            checkedAt: new Date().toISOString(),
            durationMs: 0,
          },
        }));
      } else {
        setDiagnostics((current) => ({ ...current, [check]: payload }));
      }
    } catch {
      setDiagnostics((current) => ({
        ...current,
        [check]: {
          check,
          status: "failed",
          summary: "לא התקבלה תשובה מהבדיקה.",
          checkedAt: new Date().toISOString(),
          durationMs: 0,
        },
      }));
    } finally {
      setRunningCheck(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (state !== "ready" || !data) {
    return <AccessState state={state} retry={() => void load()} />;
  }

  return (
    <div className="smith-admin">
      <Header data={data} onMenu={() => setMenuOpen(true)} />
      <div className="smith-shell">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="smith-main" id="smith-main">
          <div className="smith-title-row">
            <div>
              <p className="smith-eyebrow">ADMIN CONTROL CENTER</p>
              <h1>מרכז הבקרה התפעולי</h1>
              <p>נתוני מערכת אמיתיים ובדיקות ידניות, ללא Agent אוטונומי.</p>
            </div>
            <button
              className="smith-secondary-button"
              onClick={() => void load()}
            >
              רענון metrics
            </button>
          </div>

          <SystemStatusBar data={data} />
          <SummaryCards data={data} />
          <DiagnosticsPanel
            running={runningCheck}
            results={diagnostics}
            onRun={(check) => void runDiagnostic(check)}
          />

          <div className="smith-workspace">
            <AgentOffPanel />
            <div className="smith-operations">
              <EventsPanel events={data.overview.recent} />
              <ServicePanel data={data} diagnostics={diagnostics} />
              <div className="smith-split">
                <TestsPanel data={data} results={diagnostics} />
                <PreviewApprovalPanel />
              </div>
              <AuditPanel items={data.activity} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Header({
  data,
  onMenu,
}: {
  data: ControlCenterData;
  onMenu: () => void;
}) {
  return (
    <header className="smith-header">
      <button
        className="smith-menu-button"
        onClick={onMenu}
        aria-label="פתיחת ניווט"
      >
        ☰
      </button>
      <a className="smith-brand" href="/admin">
        <img src="/smith/smith-avatar.svg" alt="" width="34" height="34" />
        <span>
          מה שכחתי? <b>ADMIN</b>
        </span>
      </a>
      <div className="smith-environments" aria-label="מצבי סביבה">
        <Environment label="Application" state="connected" />
        <Environment
          label="Database"
          state={data.health?.database === "healthy" ? "connected" : "blocked"}
        />
        <Environment label="Smith" state="disconnected" />
      </div>
      <div className="smith-search-wrap">
        <input
          aria-label="חיפוש עתידי"
          placeholder="חיפוש באירועים ובפעילות..."
          disabled
          title="חיפוש רוחבי עדיין לא הוגדר"
        />
      </div>
      <div className="smith-admin-identity">
        <span className="smith-avatar-letter">A</span>
        <span>
          <b>Admin</b>
          <small>{data.users?.users.length ?? "אין נתונים"} משתמשים</small>
        </span>
      </div>
    </header>
  );
}

function Environment({
  label,
  state,
}: {
  label: string;
  state: SmithConnectionState;
}) {
  return (
    <span className="smith-environment" data-state={state}>
      <i />
      <span dir="ltr">{label}</span>
      <small>{connectionLabels[state]}</small>
    </span>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {open && (
        <button
          className="smith-sidebar-backdrop"
          onClick={onClose}
          aria-label="סגירת ניווט"
        />
      )}
      <aside className={`smith-sidebar ${open ? "open" : ""}`}>
        <div className="smith-sidebar-heading">
          <span>מרכז תפעול</span>
          <a href="/admin">Admin ראשי</a>
        </div>
        <p className="smith-nav-label">כלי ניהול פעילים</p>
        <nav aria-label="ניווט מרכז הבקרה">
          {navigation.map(([label, href, icon], index) => (
            <a className={index === 0 ? "active" : ""} href={href} key={href}>
              <span className={`smith-nav-icon ${icon}`} aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>
        <div className="smith-identity-card smith-agent-off">
          <img src="/smith/smith-avatar.svg" alt="" width="38" height="38" />
          <div>
            <strong>Smith Agent</strong>
            <span>יכולת עתידית</span>
            <small>
              <i /> כבוי כרגע
            </small>
          </div>
        </div>
      </aside>
    </>
  );
}

function SystemStatusBar({ data }: { data: ControlCenterData }) {
  const openai = data.health?.serviceDetails.openai.status;
  const statuses = [
    ["Application", "connected", "Connected"],
    [
      "Database",
      data.health?.database === "healthy" ? "connected" : "blocked",
      data.health?.database === "healthy" ? "Connected" : "Issue",
    ],
    ["Auth", "connected", "Connected"],
    [
      "AI",
      openai === "available"
        ? "connected"
        : openai === "failed"
          ? "blocked"
          : "not_configured",
      openai === "available"
        ? "Connected"
        : openai === "failed"
          ? "Issue"
          : "No data",
    ],
    ["Smith Agent", "disconnected", "OFF"],
    ["Preview", "disconnected", "Disconnected"],
    ["Production Executor", "disconnected", "Disconnected"],
  ] as const;
  return (
    <section className="control-status-bar" aria-label="מצב רכיבי מערכת">
      {statuses.map(([label, status, value]) => (
        <span data-state={status} key={label}>
          <i />
          <b dir="ltr">{label}</b>
          <small>{value}</small>
        </span>
      ))}
    </section>
  );
}

function SummaryCards({ data }: { data: ControlCenterData }) {
  const stats = data.overview.stats;
  const incidents = stats.aiFailures7 + stats.reminderErrors;
  const cards = [
    [
      "בריאות מערכת",
      !data.health
        ? "אין נתונים"
        : data.health.database === "healthy"
          ? "תקין"
          : "בעיה",
      data.health ? `${data.health.latencyMs}ms DB` : "אין נתונים",
      "health",
    ],
    ["משתמשים פעילים", stats.active7, "7 ימים אחרונים", "users"],
    ["ממתינים לאישור", stats.pending, `מתוך ${stats.users}`, "approval"],
    [
      "משימות",
      data.tasks?.total ?? stats.tasks,
      `${stats.completed} הושלמו`,
      "tasks",
    ],
    ["תקלות פעילות", incidents, "AI + Reminders, שבעה ימים", "incidents"],
    [
      "זמן תגובת AI",
      data.ai?.averageLatencyMs == null
        ? "אין נתונים"
        : `${data.ai.averageLatencyMs}ms`,
      `${data.ai?.failures ?? stats.aiFailures7} כשלים`,
      "preview",
    ],
  ] as const;
  return (
    <section className="smith-summary control-summary" aria-label="סיכום מערכת">
      {cards.map(([label, value, detail, tone]) => (
        <article
          className={`smith-card smith-summary-card ${tone}`}
          key={label}
        >
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{detail}</small>
        </article>
      ))}
    </section>
  );
}

function DiagnosticsPanel({
  running,
  results,
  onRun,
}: {
  running: AdminDiagnosticCheck | null;
  results: Partial<Record<AdminDiagnosticCheck, DiagnosticResult>>;
  onRun: (check: AdminDiagnosticCheck) => void;
}) {
  return (
    <section className="smith-card control-diagnostics">
      <div className="smith-panel-heading">
        <div>
          <h2>בדיקות מערכת</h2>
          <p>בדיקות דטרמיניסטיות ידניות. אין כאן החלטה או פעולה של Smith.</p>
        </div>
        <span className="smith-status-chip">ADMIN TOOLS</span>
      </div>
      <div className="diagnostic-grid">
        {diagnosticButtons.map((item) => {
          const diagnostic = results[item.check];
          const isRunning = running === item.check;
          return (
            <article
              key={item.check}
              data-status={diagnostic?.status ?? "idle"}
            >
              <button
                onClick={() => onRun(item.check)}
                disabled={running !== null}
                aria-busy={isRunning}
              >
                {isRunning ? "מריץ בדיקה…" : item.label}
              </button>
              <small>{item.description}</small>
              {diagnostic && (
                <div className="diagnostic-result" role="status">
                  <strong>{diagnostic.summary}</strong>
                  <time dateTime={diagnostic.checkedAt}>
                    {new Date(diagnostic.checkedAt).toLocaleString("he-IL")}
                    {" · "}
                    {diagnostic.durationMs}ms
                  </time>
                  {diagnostic.details && (
                    <details>
                      <summary>פרטים טכניים</summary>
                      <pre dir="ltr">
                        {JSON.stringify(diagnostic.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AgentOffPanel() {
  return (
    <section className="smith-card smith-chat-panel smith-agent-panel-off">
      <div className="smith-panel-heading">
        <div>
          <h2>Smith Agent</h2>
          <p>שכבת אוטונומיה עתידית — אינה נדרשת להפעלת מרכז הבקרה.</p>
        </div>
        <span className="smith-connection-status" data-state="disconnected">
          OFF
        </span>
      </div>
      <div className="smith-chat-empty">
        <img src="/smith/smith-avatar.svg" alt="" width="54" height="54" />
        <h3>Smith Agent כבוי כרגע</h3>
        <p>
          אין Chat פעיל, Runner אוטונומי, Preview אוטונומי או גישה ל־Production.
        </p>
      </div>
      <div className="smith-quick-actions" aria-label="יכולות עתידיות">
        {[
          "Chat אוטונומי · Future",
          "יצירת Preview · Future",
          "Runner · Future",
        ].map((label) => (
          <button key={label} disabled>
            {label}
          </button>
        ))}
      </div>
      <div className="smith-composer">
        <textarea
          rows={2}
          placeholder="Smith Agent כבוי; השתמש בבדיקות המערכת הידניות."
          disabled
          aria-label="Smith Agent כבוי"
        />
        <button disabled>כבוי</button>
      </div>
    </section>
  );
}

function EventsPanel({ events }: { events: ActivityEvent[] }) {
  return (
    <section className="smith-card smith-observations">
      <div className="smith-panel-heading">
        <div>
          <h2>אירועים ותקלות אחרונות</h2>
          <p>טלמטריה אמיתית מ־activity_events; לא ממצאי Smith.</p>
        </div>
        <span>{events.length} אירועים</span>
      </div>
      {events.length ? (
        <div className="smith-timeline">
          {events.slice(0, 10).map((event, index) => (
            <article
              key={
                event.id ?? `${event.event_type}-${event.created_at}-${index}`
              }
              data-severity={
                event.event_type.includes("failure") ? "error" : "info"
              }
            >
              <time>
                {new Date(event.created_at).toLocaleTimeString("he-IL")}
              </time>
              <i />
              <div>
                <strong dir="ltr">{event.event_type}</strong>
                <span>{eventDescription(event)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState text="אין אירועים להצגה." />
      )}
    </section>
  );
}

function eventDescription(event: ActivityEvent) {
  if (event.event_type === "ai.success") return "קריאת AI הסתיימה בהצלחה.";
  if (event.event_type === "ai.failure") return "קריאת AI נכשלה.";
  if (event.event_type === "cron.reminders.success")
    return "ריצת התזכורות הסתיימה בהצלחה.";
  if (event.event_type === "cron.reminders.failure")
    return "ריצת התזכורות נכשלה.";
  if (event.event_type === "admin.access.changed")
    return "הרשאת משתמש עודכנה על ידי Admin.";
  return "אירוע מערכת מתועד.";
}

function ServicePanel({
  data,
  diagnostics,
}: {
  data: ControlCenterData;
  diagnostics: Partial<Record<AdminDiagnosticCheck, DiagnosticResult>>;
}) {
  const storage = diagnostics.storage;
  const cronStatus = data.health?.serviceDetails.cron.status;
  const services = [
    [
      "Database",
      data.health?.database === "healthy" ? "connected" : "blocked",
      data.health ? `${data.health.latencyMs}ms` : "אין נתונים",
    ],
    ["Auth", "connected", "מחובר"],
    [
      "OpenAI",
      data.health?.services.openai ? "connected" : "not_configured",
      data.health?.services.openai ? "זמין" : "אין נתונים / לא זמין",
    ],
    [
      "Storage",
      storage?.status === "passed"
        ? "connected"
        : storage?.status === "failed"
          ? "blocked"
          : "not_configured",
      storage?.summary ?? "נדרש לבדוק ידנית",
    ],
    [
      "Push",
      data.health?.services.push ? "connected" : "not_configured",
      data.health?.services.push ? "מוגדר" : "לא הוגדר",
    ],
    [
      "Cron",
      cronStatus === "available"
        ? "connected"
        : cronStatus === "failed"
          ? "blocked"
          : "not_configured",
      cronStatus === "available"
        ? "ריצה אחרונה הצליחה"
        : cronStatus === "failed"
          ? "ריצה אחרונה נכשלה"
          : "אין נתונים / לא הוגדר",
    ],
    [
      "Agent API",
      data.ai?.lastTestedAt ? "connected" : "not_configured",
      data.ai?.lastTestedAt ? "פעילות AI נצפתה" : "אין נתונים",
    ],
  ] as const;
  return (
    <section className="smith-card service-status-panel">
      <div className="smith-panel-heading">
        <div>
          <h2>רכיבי מערכת</h2>
          <p>מצב נוכחי מה־Health API והטלמטריה הקיימת.</p>
        </div>
        <time>
          {data.health?.checkedAt
            ? new Date(data.health.checkedAt).toLocaleString("he-IL")
            : "אין נתונים"}
        </time>
      </div>
      <div className="service-status-grid">
        {services.map(([label, state, detail]) => (
          <span data-state={state} key={label}>
            <i />
            <b dir="ltr">{label}</b>
            <small>{detail}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

function TestsPanel({
  data,
  results,
}: {
  data: ControlCenterData;
  results: Partial<Record<AdminDiagnosticCheck, DiagnosticResult>>;
}) {
  const latest = results.playwright ?? results["unit-tests"];
  const evidence = data.evidence?.playwright;
  return (
    <section className="smith-card smith-small-panel">
      <div className="smith-panel-heading">
        <h2>בדיקות אוטומטיות</h2>
        <span
          className="smith-connection-status"
          data-state={latest?.status === "passed" ? "connected" : "local_only"}
        >
          {latest?.status === "passed" ? "עבר כעת" : "Evidence מקומי"}
        </span>
      </div>
      {latest ? (
        <p className="test-evidence-result">{latest.summary}</p>
      ) : evidence ? (
        <div className="test-evidence-result">
          <strong>{evidence.status}</strong>
          <span>
            {evidence.results.passed} עברו · {evidence.results.failed} נכשלו ·{" "}
            {evidence.results.skipped} דולגו
          </span>
          <time>{new Date(evidence.executedAt).toLocaleString("he-IL")}</time>
          <small>Evidence מקומי בלבד; אינו אישור Production.</small>
        </div>
      ) : (
        <EmptyState text="אין evidence זמין." />
      )}
    </section>
  );
}

function PreviewApprovalPanel() {
  return (
    <section className="smith-card smith-small-panel">
      <div className="smith-panel-heading">
        <h2>Preview ואישור Production</h2>
        <span className="smith-connection-status" data-state="disconnected">
          מנותק
        </span>
      </div>
      <EmptyState text="Preview אוטונומי ו־ProductionExecutor כבויים." />
    </section>
  );
}

function AuditPanel({ items }: { items: ActivityEvent[] }) {
  return (
    <section className="smith-card smith-audit-panel">
      <div className="smith-panel-heading">
        <div>
          <h2>פעילות אחרונה</h2>
          <p>Audit ופעילות Admin אמיתיים בלבד.</p>
        </div>
        <span>{items.length} רשומות</span>
      </div>
      {items.length ? (
        <ul className="control-activity-list">
          {items.slice(0, 8).map((item, index) => (
            <li key={item.id ?? `${item.event_type}-${index}`}>
              <b dir="ltr">{item.event_type}</b>
              <time>{new Date(item.created_at).toLocaleString("he-IL")}</time>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState text="אין פעילות להצגה." />
      )}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="smith-empty">{text}</p>;
}

function AccessState({
  state,
  retry,
}: {
  state: LoadState;
  retry: () => void;
}) {
  const content = {
    loading: ["טוען את מרכז הבקרה…", "קורא נתונים מממשקי Admin הקיימים."],
    unauthorized: ["נדרשת כניסת מנהל", "יש להתחבר דרך ממשק ה־Admin."],
    forbidden: ["אין הרשאת מנהל", "החשבון המחובר אינו מורשה למרכז הבקרה."],
    error: ["לא ניתן לטעון את מרכז הבקרה", "אחד מממשקי הליבה לא הגיב בהצלחה."],
    ready: ["", ""],
  }[state];
  return (
    <main className="smith-access-state">
      <img src="/smith/smith-avatar.svg" alt="" width="58" height="58" />
      <h1>{content[0]}</h1>
      <p>{content[1]}</p>
      {state === "unauthorized" || state === "forbidden" ? (
        <a href="/admin">מעבר ל־Admin</a>
      ) : state === "error" ? (
        <button onClick={retry}>נסה שוב</button>
      ) : null}
    </main>
  );
}
