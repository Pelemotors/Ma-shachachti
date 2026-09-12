"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  OperationalDetailDrawer,
  type OperationalDetail,
} from "./operational-detail-drawer";
import { OperationalDiagnosticsPanel } from "./operational-diagnostics-panel";
import { OperationalEventsPanel } from "./operational-events-panel";
import { supabase } from "@/lib/supabase-browser";
import type {
  AdminAiMetrics,
  AdminHealth,
  AdminIncidentsResponse,
  AdminOverview,
  AdminTasks,
  AdminUsers,
  OperationalEvent,
  TestEvidence,
} from "@/lib/admin-control-contract";
import type {
  AdminDiagnosticCheck,
  DiagnosticResult,
} from "@/lib/admin-diagnostic-contract";
import {
  ADMIN_CONTROL_SECTIONS,
  SMITH_FUTURE_SECTIONS,
  isSmithFutureSection,
  type AdminControlSection,
} from "@/lib/admin-control-sections";

type LoadState = "loading" | "ready" | "unauthorized" | "forbidden" | "error";
type Section = AdminControlSection;
type ControlCenterData = {
  overview: AdminOverview;
  health: AdminHealth | null;
  ai: AdminAiMetrics | null;
  incidents: AdminIncidentsResponse | null;
  tasks: AdminTasks | null;
  users: AdminUsers | null;
  activity: OperationalEvent[];
  evidence: TestEvidence | null;
};

const navigation: Array<[Section, string, string, string]> = [
  ["overview", "סקירה תפעולית", "/admin/smith", "events"],
  ["events", "אירועים ותקלות", "/admin/smith/events", "events"],
  ["tests", "בדיקות מערכת", "/admin/smith/tests", "tests"],
  ["audit", "Audit", "/admin/smith/audit", "audit"],
  ["setup", "Setup", "/admin/smith/setup", "setup"],
];

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
  const pathname = usePathname();
  const section = sectionFromPath(pathname);
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<ControlCenterData | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [detail, setDetail] = useState<OperationalDetail | null>(null);
  const [running, setRunning] = useState<{
    check: AdminDiagnosticCheck;
    startedAt: string;
  } | null>(null);
  const [diagnostics, setDiagnostics] = useState<
    Partial<Record<AdminDiagnosticCheck, DiagnosticResult>>
  >({});

  async function load() {
    if (data) setRefreshing(true);
    else setState("loading");
    setRefreshError("");
    try {
      const token = await getAdminToken();
      const paths = [
        "/api/admin/overview",
        "/api/admin/health",
        "/api/admin/ai",
        "/api/admin/incidents",
        "/api/admin/tasks",
        "/api/admin/users",
        "/api/admin/activity?limit=100",
        "/api/admin/diagnostics/evidence",
      ] as const;
      const responses = await Promise.all(
        paths.map((path) => fetchAdminResource(path, token)),
      );
      const byPath = new Map(
        paths.map((path, index) => [path, responses[index]]),
      );
      const usersResponse = byPath.get("/api/admin/users")!;
      if (usersResponse.status === 401) {
        setState("unauthorized");
        return;
      }
      if (usersResponse.status === 403) {
        setState("forbidden");
        return;
      }
      const overviewResponse = byPath.get("/api/admin/overview")!;
      if (!overviewResponse.ok) {
        setState("error");
        return;
      }
      const optionalJson = async <T,>(path: (typeof paths)[number]) => {
        const response = byPath.get(path);
        return response?.ok ? ((await response.json()) as T) : null;
      };
      const overview = (await overviewResponse.json()) as AdminOverview;
      const nextData = {
        overview,
        health: await optionalJson<AdminHealth>("/api/admin/health"),
        ai: await optionalJson<AdminAiMetrics>("/api/admin/ai"),
        incidents: await optionalJson<AdminIncidentsResponse>(
          "/api/admin/incidents",
        ),
        tasks: await optionalJson<AdminTasks>("/api/admin/tasks"),
        users: await optionalJson<AdminUsers>("/api/admin/users"),
        activity:
          (
            await optionalJson<{ events: OperationalEvent[] }>(
              "/api/admin/activity?limit=100",
            )
          )?.events ?? [],
        evidence: await optionalJson<TestEvidence>(
          "/api/admin/diagnostics/evidence",
        ),
      };
      const failedOptional = paths.filter(
        (path) =>
          path !== "/api/admin/overview" &&
          path !== "/api/admin/users" &&
          !byPath.get(path)?.ok,
      );
      setData(nextData);
      setUpdatedAt(new Date().toISOString());
      setClock(Date.now());
      setState("ready");
      if (failedOptional.length) {
        setRefreshError(
          `${failedOptional.length} מקורות משניים לא נטענו; מוצגים הנתונים הזמינים.`,
        );
      }
    } catch {
      if (data) setRefreshError("הרענון נכשל; הנתונים הקודמים נשארו מוצגים.");
      else setState("error");
    } finally {
      setRefreshing(false);
    }
  }

  async function runDiagnostic(check: AdminDiagnosticCheck) {
    const startedAt = new Date().toISOString();
    setRunning({ check, startedAt });
    try {
      const token = await getAdminToken();
      const response = await fetch(`/api/admin/diagnostics/${check}`, {
        method: "POST",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      const payload = await response.json();
      if (!response.ok) {
        const completedAt = new Date().toISOString();
        setDiagnostics((current) => ({
          ...current,
          [check]: {
            check,
            status: "fail",
            summary: payload.error ?? "הבדיקה נכשלה.",
            startedAt,
            completedAt,
            durationMs:
              new Date(completedAt).getTime() - new Date(startedAt).getTime(),
            warnings: [],
            details: payload.code ? { code: payload.code } : undefined,
          },
        }));
      } else {
        setDiagnostics((current) => ({ ...current, [check]: payload }));
      }
    } catch {
      const completedAt = new Date().toISOString();
      setDiagnostics((current) => ({
        ...current,
        [check]: {
          check,
          status: "fail",
          summary: "לא התקבלה תשובה מהבדיקה.",
          startedAt,
          completedAt,
          durationMs:
            new Date(completedAt).getTime() - new Date(startedAt).getTime(),
          warnings: [],
        },
      }));
    } finally {
      setRunning(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (state !== "ready" || !data || !updatedAt) {
    return <AccessState state={state} retry={() => void load()} />;
  }

  const stale = clock - new Date(updatedAt).getTime() > 5 * 60_000;
  const title = {
    overview: [
      "מרכז הבקרה התפעולי",
      "נתוני מערכת אמיתיים וכלי Admin דטרמיניסטיים.",
    ],
    events: [
      "אירועים ותקלות אחרונות",
      "סינון, חיפוש ופרטים מתוך הטלמטריה הקיימת.",
    ],
    tests: [
      "בדיקות מערכת",
      "בדיקות ידניות עם evidence מובנה וללא shell חופשי.",
    ],
    audit: ["Audit ופעילות", "אירועי Admin ומערכת מתועדים."],
    setup: ["מצב חיבורים", "מה פעיל, מה כבוי ומה מנותק במכוון."],
    previews: [
      SMITH_FUTURE_SECTIONS.previews.title,
      SMITH_FUTURE_SECTIONS.previews.summary,
    ],
    approvals: [
      SMITH_FUTURE_SECTIONS.approvals.title,
      SMITH_FUTURE_SECTIONS.approvals.summary,
    ],
    rollback: [
      SMITH_FUTURE_SECTIONS.rollback.title,
      SMITH_FUTURE_SECTIONS.rollback.summary,
    ],
  }[section];

  return (
    <div className="smith-admin">
      <Header data={data} onMenu={() => setMenuOpen(true)} />
      <div className="smith-shell">
        <Sidebar
          section={section}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
        />
        <main className="smith-main" id="smith-main">
          <div className="smith-title-row">
            <div>
              <p className="smith-eyebrow">ADMIN CONTROL CENTER</p>
              <h1>{title[0]}</h1>
              <p>{title[1]}</p>
              <Freshness updatedAt={updatedAt} stale={stale} />
            </div>
            <button
              className="smith-secondary-button"
              onClick={() => void load()}
              disabled={refreshing}
            >
              {refreshing ? "מרענן…" : "רענון metrics"}
            </button>
          </div>

          {refreshError && (
            <div className="control-refresh-error" role="alert">
              <span>{refreshError}</span>
              <button onClick={() => void load()}>נסה שוב</button>
            </div>
          )}

          {section === "overview" && (
            <>
              <SystemStatusBar data={data} onOpen={setDetail} />
              <SummaryCards data={data} onOpen={setDetail} />
              <QuickActions
                onRefresh={() => void load()}
                onCheck={(check) => void runDiagnostic(check)}
                onOpen={setDetail}
                running={running !== null}
              />
              <OperationalDiagnosticsPanel
                running={running}
                results={diagnostics}
                onRun={(check) => void runDiagnostic(check)}
              />
              <div className="smith-workspace">
                <AgentOffPanel />
                <div className="smith-operations">
                  <OperationalEventsPanel
                    events={data.activity}
                    incidents={data.incidents}
                    updatedAt={updatedAt}
                    refreshing={refreshing}
                    onRefresh={() => void load()}
                    onSelect={(event) => setDetail({ event })}
                  />
                  <ServicePanel data={data} diagnostics={diagnostics} />
                  <div className="smith-split">
                    <TestsPanel data={data} results={diagnostics} />
                    <PreviewApprovalPanel />
                  </div>
                  <AuditPanel
                    items={data.activity}
                    onSelect={(event) => setDetail({ event })}
                  />
                </div>
              </div>
            </>
          )}

          {section === "events" && (
            <>
              <IncidentSummary incidents={data.incidents} onOpen={setDetail} />
              <OperationalEventsPanel
                events={data.activity}
                incidents={data.incidents}
                updatedAt={updatedAt}
                refreshing={refreshing}
                onRefresh={() => void load()}
                onSelect={(event) => setDetail({ event })}
              />
            </>
          )}

          {section === "tests" && (
            <>
              <OperationalDiagnosticsPanel
                running={running}
                results={diagnostics}
                onRun={(check) => void runDiagnostic(check)}
              />
              <TestsPanel data={data} results={diagnostics} />
            </>
          )}

          {section === "audit" && (
            <AuditPanel
              items={data.activity}
              onSelect={(event) => setDetail({ event })}
              expanded
            />
          )}

          {section === "setup" && (
            <>
              <SystemStatusBar data={data} onOpen={setDetail} />
              <ServicePanel data={data} diagnostics={diagnostics} />
              <IntentionalBoundaries onOpen={setDetail} />
            </>
          )}

          {isSmithFutureSection(section) && (
            <DisconnectedCapabilityPanel section={section} onOpen={setDetail} />
          )}
        </main>
      </div>
      <OperationalDetailDrawer
        detail={detail}
        overview={data.overview}
        health={data.health}
        ai={data.ai}
        incidents={data.incidents}
        tasks={data.tasks}
        users={data.users}
        updatedAt={updatedAt}
        refreshing={refreshing}
        onRefresh={() => void load()}
        onClose={() => setDetail(null)}
      />
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
        <Environment label="Application" state="connected" text="מחובר" />
        <Environment
          label="Database"
          state={data.health?.database === "healthy" ? "connected" : "blocked"}
          text={data.health?.database === "healthy" ? "מחובר" : "בעיה"}
        />
        <Environment label="Smith" state="off" text="OFF" />
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
  text,
}: {
  label: string;
  state: string;
  text: string;
}) {
  return (
    <span className="smith-environment" data-state={state}>
      <i />
      <span dir="ltr">{label}</span>
      <small>{text}</small>
    </span>
  );
}

function Sidebar({
  section,
  open,
  onClose,
}: {
  section: Section;
  open: boolean;
  onClose: () => void;
}) {
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
          {navigation.map(([id, label, href, icon]) => (
            <a
              className={section === id ? "active" : ""}
              href={href}
              key={href}
            >
              <span className={`smith-nav-icon ${icon}`} aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>
        <p className="smith-nav-label">Smith — לא הוגדר עדיין</p>
        <nav aria-label="יכולות Smith עתידיות">
          {(
            [
              ["previews", "Preview Lab", "/admin/smith/previews", "preview"],
              ["approvals", "אישורים", "/admin/smith/approvals", "approval"],
              ["rollback", "Rollback", "/admin/smith/rollback", "approval"],
            ] as const
          ).map(([id, label, href, icon]) => (
            <a
              className={section === id ? "active" : ""}
              href={href}
              key={href}
            >
              <span className={`smith-nav-icon ${icon}`} aria-hidden="true" />
              {label}
              <small>לא הוגדר</small>
            </a>
          ))}
        </nav>
        <div className="smith-identity-card smith-agent-off">
          <img src="/smith/smith-avatar.svg" alt="" width="38" height="38" />
          <div>
            <strong>Smith Agent</strong>
            <span>יכולת עתידית</span>
            <small>
              <i /> OFF — כבוי במכוון
            </small>
          </div>
        </div>
      </aside>
    </>
  );
}

function SystemStatusBar({
  data,
  onOpen,
}: {
  data: ControlCenterData;
  onOpen: (detail: OperationalDetail) => void;
}) {
  const openai = data.health?.serviceDetails.openai.status;
  const statuses: Array<{
    label: string;
    state: string;
    value: string;
    detail: OperationalDetail;
  }> = [
    {
      label: "Application",
      state: "connected",
      value: "Connected",
      detail: "application",
    },
    {
      label: "Database",
      state: data.health?.database === "healthy" ? "connected" : "blocked",
      value: data.health?.database === "healthy" ? "Connected" : "Issue",
      detail: "system",
    },
    { label: "Auth", state: "connected", value: "Connected", detail: "auth" },
    {
      label: "AI",
      state:
        openai === "available"
          ? "connected"
          : openai === "failed"
            ? "blocked"
            : "not_configured",
      value:
        openai === "available"
          ? "Connected"
          : openai === "failed"
            ? "Issue"
            : "No data",
      detail: "ai",
    },
    {
      label: "Smith Agent",
      state: "off",
      value: "OFF — deliberate",
      detail: "smith",
    },
    {
      label: "Preview",
      state: "disconnected",
      value: "Disconnected",
      detail: "preview",
    },
    {
      label: "Production Executor",
      state: "disconnected",
      value: "Disconnected",
      detail: "production",
    },
  ];
  return (
    <section className="control-status-bar" aria-label="מצב רכיבי מערכת">
      {statuses.map((status) => (
        <button
          data-state={status.state}
          key={status.label}
          onClick={() => onOpen(status.detail)}
        >
          <i />
          <b dir="ltr">{status.label}</b>
          <small>{status.value}</small>
        </button>
      ))}
    </section>
  );
}

function SummaryCards({
  data,
  onOpen,
}: {
  data: ControlCenterData;
  onOpen: (detail: OperationalDetail) => void;
}) {
  const stats = data.overview.stats;
  const cards: Array<{
    label: string;
    value: string | number;
    detail: string;
    tone: string;
    target: OperationalDetail;
  }> = [
    {
      label: "בריאות מערכת",
      value: !data.health
        ? "אין נתונים"
        : data.health.database === "healthy"
          ? "תקין"
          : "בעיה",
      detail: data.health ? `${data.health.latencyMs}ms DB` : "אין נתונים",
      tone: "health",
      target: "system",
    },
    {
      label: "משתמשים פעילים",
      value: stats.active7,
      detail: "פעילות מזוהה ב־7 ימים",
      tone: "users",
      target: "active-users",
    },
    {
      label: "ממתינים לאישור",
      value: stats.pending,
      detail: `מתוך ${stats.users}`,
      tone: "approval",
      target: "pending-users",
    },
    {
      label: "משימות",
      value: data.tasks?.total ?? stats.tasks,
      detail: `${stats.completed} הושלמו`,
      tone: "tasks",
      target: "tasks",
    },
    {
      label: "תקלות אחרונות",
      value: data.incidents?.occurrenceCount ?? "אין נתונים",
      detail: data.incidents
        ? `${data.incidents.categoryCount} תחומים · ${data.incidents.windowDays} ימים`
        : "אין נתונים",
      tone: "incidents",
      target: "incidents",
    },
    {
      label: "זמן הכנת החלטת AI",
      value:
        data.ai?.averageLatencyMs == null
          ? "אין נתונים"
          : `${data.ai.averageLatencyMs}ms`,
      detail: data.ai
        ? `ממוצע ${data.ai.latencySampleCount} הצלחות`
        : "אין נתונים",
      tone: "preview",
      target: "ai",
    },
  ];
  return (
    <section className="smith-summary control-summary" aria-label="סיכום מערכת">
      {cards.map((card) => (
        <article
          className={`smith-card smith-summary-card ${card.tone} actionable`}
          key={card.label}
        >
          <button onClick={() => onOpen(card.target)}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
            <em>פתח פרטים ←</em>
          </button>
        </article>
      ))}
    </section>
  );
}

function QuickActions({
  onRefresh,
  onCheck,
  onOpen,
  running,
}: {
  onRefresh: () => void;
  onCheck: (check: AdminDiagnosticCheck) => void;
  onOpen: (detail: OperationalDetail) => void;
  running: boolean;
}) {
  return (
    <section className="control-quick-actions" aria-label="פעולות Admin מהירות">
      <strong>פעולות מהירות</strong>
      <button onClick={onRefresh}>רענן metrics</button>
      <button onClick={() => onCheck("full-health")} disabled={running}>
        הרץ Health Check
      </button>
      <button onClick={() => onCheck("openai")} disabled={running}>
        בדוק OpenAI
      </button>
      <button onClick={() => onCheck("push-reminders")} disabled={running}>
        בדוק Push
      </button>
      <button onClick={() => onOpen("incidents")}>הצג failures אחרונים</button>
      <button onClick={() => onOpen("pending-users")}>
        הצג משתמשים ממתינים
      </button>
      <a href="/admin/smith/audit">הצג פעילות אחרונה</a>
      <a href="/admin/smith/audit">פתח Audit</a>
      <a href="/admin/smith/setup">פתח Setup</a>
    </section>
  );
}

function AgentOffPanel() {
  return (
    <section className="smith-card smith-chat-panel smith-agent-panel-off">
      <div className="smith-panel-heading">
        <div>
          <h2>Smith Autonomous Agent</h2>
          <p>שכבת אוטונומיה עתידית; כלי ה־Admin אינם תלויים בה.</p>
        </div>
        <span className="smith-connection-status" data-state="off">
          OFF
        </span>
      </div>
      <div className="smith-chat-empty">
        <img src="/smith/smith-avatar.svg" alt="" width="54" height="54" />
        <h3>Smith Agent כבוי כרגע</h3>
        <p>אין Chat, Runner, Preview אוטונומי או גישה ל־Production.</p>
      </div>
      <div className="smith-quick-actions" aria-label="יכולות עתידיות">
        {["Chat · לא הוגדר", "Preview · לא הוגדר", "Runner · לא הוגדר"].map(
          (label) => (
            <button key={label} disabled title="היכולת כבויה במכוון">
              {label}
            </button>
          ),
        )}
      </div>
    </section>
  );
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
      storage?.status === "pass"
        ? "connected"
        : storage?.status === "fail"
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
        {services.map(([label, state, value]) => (
          <span data-state={state} key={label}>
            <i />
            <b dir="ltr">{label}</b>
            <small>{value}</small>
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
          data-state={latest?.status === "pass" ? "connected" : "local_only"}
        >
          {latest?.status === "pass" ? "עבר כעת" : "Evidence מקומי"}
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
        <h2>Preview ו־Production</h2>
        <span className="smith-connection-status" data-state="disconnected">
          מנותק
        </span>
      </div>
      <EmptyState text="Preview אוטונומי ו־ProductionExecutor כבויים במכוון." />
    </section>
  );
}

function AuditPanel({
  items,
  onSelect,
  expanded = false,
}: {
  items: OperationalEvent[];
  onSelect: (event: OperationalEvent) => void;
  expanded?: boolean;
}) {
  const visible = expanded ? items : items.slice(0, 8);
  return (
    <section className="smith-card smith-audit-panel">
      <div className="smith-panel-heading">
        <div>
          <h2>פעילות אחרונה</h2>
          <p>Audit ופעילות Admin אמיתיים בלבד.</p>
        </div>
        <span>{visible.length} רשומות</span>
      </div>
      {visible.length ? (
        <ul className="control-activity-list">
          {visible.map((item) => (
            <li key={item.id}>
              <button onClick={() => onSelect(item)}>
                <b dir="ltr">{item.event_type}</b>
                <time>{new Date(item.created_at).toLocaleString("he-IL")}</time>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState text="אין פעילות להצגה." />
      )}
    </section>
  );
}

function IncidentSummary({
  incidents,
  onOpen,
}: {
  incidents: AdminIncidentsResponse | null;
  onOpen: (detail: OperationalDetail) => void;
}) {
  return (
    <section className="smith-card incident-summary">
      <div>
        <span>הופעות ב־7 ימים</span>
        <strong>{incidents?.occurrenceCount ?? "אין נתונים"}</strong>
      </div>
      <div>
        <span>תחומים</span>
        <strong>{incidents?.categoryCount ?? "אין נתונים"}</strong>
      </div>
      <div>
        <span>לא פתורות</span>
        <strong>{incidents?.unresolvedCount ?? "אין נתונים"}</strong>
      </div>
      <button onClick={() => onOpen("incidents")}>פתח פירוט תקלות</button>
    </section>
  );
}

function DisconnectedCapabilityPanel({
  section,
  onOpen,
}: {
  section: keyof typeof SMITH_FUTURE_SECTIONS;
  onOpen: (detail: OperationalDetail) => void;
}) {
  const capability = SMITH_FUTURE_SECTIONS[section];
  const detail: OperationalDetail =
    section === "previews"
      ? "preview"
      : section === "approvals" || section === "rollback"
        ? "production"
        : "smith";
  return (
    <section className="smith-card disconnected-capability">
      <div className="smith-panel-heading">
        <div>
          <h2>{capability.title}</h2>
          <p>{capability.summary}</p>
        </div>
        <span className="smith-connection-status" data-state="disconnected">
          {capability.status}
        </span>
      </div>
      <p className="smith-empty">לא הוגדר עדיין</p>
      <button className="smith-secondary-button" onClick={() => onOpen(detail)}>
        הסבר על המצב
      </button>
    </section>
  );
}

function IntentionalBoundaries({
  onOpen,
}: {
  onOpen: (detail: OperationalDetail) => void;
}) {
  return (
    <section className="smith-card intentional-boundaries">
      <h2>חיבורים מנותקים במכוון</h2>
      <button onClick={() => onOpen("smith")}>
        <b>Smith Agent</b>
        <span>OFF — deliberately disabled</span>
      </button>
      <button onClick={() => onOpen("preview")}>
        <b>Preview</b>
        <span>DISCONNECTED</span>
      </button>
      <button onClick={() => onOpen("production")}>
        <b>Production Executor</b>
        <span>DISCONNECTED</span>
      </button>
    </section>
  );
}

function Freshness({
  updatedAt,
  stale,
}: {
  updatedAt: string;
  stale: boolean;
}) {
  return (
    <span className="control-freshness" data-stale={stale}>
      {stale ? "נתונים ישנים" : "עודכן"}:{" "}
      {new Date(updatedAt).toLocaleString("he-IL")}
    </span>
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
    error: ["לא ניתן לטעון את מרכז הבקרה", "ממשק הליבה לא הגיב בהצלחה."],
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

function sectionFromPath(pathname: string): Section {
  const segment = pathname.split("/").filter(Boolean).at(-1);
  if (
    segment &&
    segment !== "overview" &&
    (ADMIN_CONTROL_SECTIONS as readonly string[]).includes(segment)
  ) {
    return segment as Section;
  }
  return "overview";
}
