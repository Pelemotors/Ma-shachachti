"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import type {
  SmithConnectionState,
  SmithDashboardData,
  SmithObservation,
} from "@/lib/smith/types";

type LoadState = "loading" | "ready" | "unauthorized" | "forbidden" | "error";

const smithNavigation = [
  ["שיחה עם Smith", "/admin/smith", "chat"],
  ["אירועי מערכת", "/admin/smith/events", "events"],
  ["Preview Lab", "/admin/smith/previews", "preview"],
  ["בדיקות", "/admin/smith/tests", "tests"],
  ["אישורים", "/admin/smith/approvals", "approvals"],
  ["Audit", "/admin/smith/audit", "audit"],
  ["Rollback", "/admin/smith/rollback", "rollback"],
  ["Setup", "/admin/smith/setup", "setup"],
] as const;

const connectionLabels: Record<SmithConnectionState, string> = {
  connected: "מחובר",
  disconnected: "לא מחובר",
  partial: "חלקי",
  blocked: "חסום",
  not_configured: "לא הוגדר",
  local_only: "מקומי בלבד",
};

async function fetchSmithOverview() {
  const sessionResult = await Promise.race([
    supabase?.auth.getSession(),
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), 1_500);
    }),
  ]);
  const token = sessionResult?.data.session?.access_token;
  return fetch("/api/admin/smith/overview", {
    cache: "no-store",
    headers: { Authorization: token ? `Bearer ${token}` : "" },
  });
}

export function SmithControlCenter() {
  const [state, setState] = useState<LoadState>("loading");
  const [dashboard, setDashboard] = useState<SmithDashboardData | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  async function load() {
    setState("loading");
    const response = await Promise.race([
      fetchSmithOverview(),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), 10_000);
      }),
    ]).catch(() => null);
    if (!response) return setState("error");
    if (response.status === 401) return setState("unauthorized");
    if (response.status === 403) return setState("forbidden");
    if (!response.ok) return setState("error");
    setDashboard(await response.json());
    setState("ready");
  }

  useEffect(() => {
    void load();
  }, []);

  if (state !== "ready" || !dashboard) {
    return <AccessState state={state} retry={() => void load()} />;
  }

  return (
    <div className="smith-admin">
      <Header dashboard={dashboard} onMenu={() => setMenuOpen(true)} />
      <div className="smith-shell">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="smith-main" id="smith-main">
          <div className="smith-title-row">
            <div>
              <p className="smith-eyebrow">SMITH CONTROL CENTER</p>
              <h1>מרכז הבקרה</h1>
              <p>מצב המערכת, עבודות פעילות ושינויים שממתינים להחלטה.</p>
            </div>
            <button
              className="smith-secondary-button"
              onClick={() => void load()}
            >
              רענון
            </button>
          </div>

          {!dashboard.enabled && (
            <div className="smith-notice" role="status">
              <strong>Smith Control Plane עדיין לא מחובר.</strong>
              <span>
                ה־POC המקומי עבר, אך לא הוחל schema על Production. הממשק מציג
                מצבי Empty ו־Disconnected אמיתיים בלבד.
              </span>
            </div>
          )}

          <SummaryCards dashboard={dashboard} />

          <div className="smith-workspace">
            <ChatPanel enabled={dashboard.enabled} />
            <div className="smith-operations">
              <ObservationPanel observations={dashboard.observations} />
              <PreviewPanel state={dashboard.setup.preview} />
              <div className="smith-split">
                <TestsPanel state={dashboard.setup.playwright} />
                <ApprovalPanel dashboard={dashboard} />
              </div>
              <AuditPanel items={dashboard.audit} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Header({
  dashboard,
  onMenu,
}: {
  dashboard: SmithDashboardData;
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
        <Environment label="Production" state="not_configured" />
        <Environment label="Preview" state={dashboard.setup.preview} />
        <Environment label="Test" state={dashboard.setup.testEnvironment} />
      </div>
      <div className="smith-search-wrap">
        <label className="sr-only" htmlFor="smith-search">
          חיפוש Work Items ותצפיות
        </label>
        <input
          id="smith-search"
          placeholder="חיפוש Work Items ותצפיות..."
          disabled
          title="החיפוש יופעל לאחר חיבור ה-Control Plane"
        />
      </div>
      <div className="smith-admin-identity">
        <span className="smith-avatar-letter">A</span>
        <span>
          <b>Admin</b>
          <small>מנהל מערכת</small>
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
          <span>ניהול קיים</span>
          <a href="/admin">חזרה ל־Admin</a>
        </div>
        <p className="smith-nav-label">שכבת Smith</p>
        <nav aria-label="ניווט Smith">
          {smithNavigation.map(([label, href, icon], index) => (
            <a className={index === 0 ? "active" : ""} href={href} key={href}>
              <span className={`smith-nav-icon ${icon}`} aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>
        <div className="smith-identity-card">
          <img src="/smith/smith-avatar.svg" alt="" width="38" height="38" />
          <div>
            <strong>Smith</strong>
            <span>מסתכל. מבין. מקדם.</span>
            <small>
              <i className="smith-breathing-dot" /> ממתין למשימה
            </small>
          </div>
        </div>
      </aside>
    </>
  );
}

function SummaryCards({ dashboard }: { dashboard: SmithDashboardData }) {
  const cards = [
    ["בריאות מערכת", dashboard.summary.systemHealth, "health"],
    ["משתמשים פעילים", dashboard.summary.activeUsers, "users"],
    ["תקלות פעילות", dashboard.summary.activeIncidents, "incidents"],
    ["Preview מוכן", dashboard.summary.readyPreviews, "preview"],
    ["ממתין לאישור", dashboard.summary.pendingApprovals, "approval"],
  ] as const;
  return (
    <section className="smith-summary" aria-label="סיכום מערכת">
      {cards.map(([label, value, tone]) => (
        <article
          className={`smith-card smith-summary-card ${tone}`}
          key={label}
        >
          <span>{label}</span>
          <strong>{value == null ? "—" : value}</strong>
          <small>{value == null ? "אין מספיק נתונים" : "נתון מאומת"}</small>
        </article>
      ))}
    </section>
  );
}

function ChatPanel({ enabled }: { enabled: boolean }) {
  return (
    <section className="smith-card smith-chat-panel">
      <div className="smith-panel-heading">
        <div>
          <h2>שיחה עם Smith</h2>
          <p>
            העוזר התפעולי של מה שכחתי? • רואה את המערכת • מנתח • בונה • בודק
          </p>
        </div>
        <span className="smith-status-chip">
          {enabled ? "מוכן לקבלת עבודה" : "לא מחובר"}
        </span>
      </div>
      <div className="smith-chat-empty">
        <img src="/smith/smith-avatar.svg" alt="" width="54" height="54" />
        <h3>כתוב ל־Smith מה תרצה לבדוק, לשפר או לבנות.</h3>
        <p>Smith עובד מול Preview/Test ואינו משנה Production ללא אישור.</p>
      </div>
      <div className="smith-quick-actions" aria-label="פעולות מהירות">
        {["בדוק תקלה", "הכן Preview", "הרץ בדיקות", "הצג תקלות חמות"].map(
          (label) => (
            <button
              key={label}
              disabled
              title="הפעולה תופעל לאחר חיבור ה-Control Plane"
            >
              {label}
            </button>
          ),
        )}
      </div>
      <div className="smith-composer">
        <textarea
          rows={2}
          placeholder="כתוב ל-Smith מה לבדוק או לשנות..."
          disabled={!enabled}
          aria-label="הודעה ל-Smith"
        />
        <button disabled aria-label="שליחת הודעה">
          שליחה
        </button>
      </div>
    </section>
  );
}

function ObservationPanel({
  observations,
}: {
  observations: SmithObservation[];
}) {
  return (
    <section className="smith-card smith-observations">
      <div className="smith-panel-heading">
        <div>
          <h2>מה Smith זיהה היום</h2>
          <p>אירועים שעברו סינון, redaction וניתוח דטרמיניסטי.</p>
        </div>
        <a href="/admin/smith/events">הצג הכול</a>
      </div>
      {observations.length ? (
        <div className="smith-timeline">
          {observations.map((observation) => (
            <article key={observation.id} data-severity={observation.severity}>
              <time>
                {new Date(observation.observed_at).toLocaleTimeString("he-IL")}
              </time>
              <i />
              <div>
                <strong>{observation.title}</strong>
                <span>{observation.summary}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState text="לא זוהו אירועים חריגים כרגע." />
      )}
    </section>
  );
}

function PreviewPanel({ state }: { state: SmithConnectionState }) {
  return (
    <section className="smith-card smith-preview-panel">
      <div className="smith-panel-heading">
        <div>
          <h2>Preview Lab</h2>
          <p>Preview, צילום מסך וראיות לגרסת SHA מדויקת.</p>
        </div>
        <Status state={state} />
      </div>
      <EmptyState
        text={
          state === "disconnected"
            ? "Preview Provider עדיין לא הוגדר."
            : "אין Preview שמוכן לבדיקה."
        }
      />
    </section>
  );
}

function TestsPanel({ state }: { state: SmithConnectionState }) {
  return (
    <section className="smith-card smith-small-panel">
      <div className="smith-panel-heading">
        <h2>בדיקות אוטומטיות</h2>
        <Status state={state} />
      </div>
      <EmptyState
        text={
          state === "not_configured"
            ? "מנוע בדיקות הדפדפן עדיין לא מחובר."
            : "עדיין לא הורצה בדיקה עבור עבודה זו."
        }
      />
    </section>
  );
}

function ApprovalPanel({ dashboard }: { dashboard: SmithDashboardData }) {
  return (
    <section className="smith-card smith-small-panel">
      <div className="smith-panel-heading">
        <h2>ממתין לאישור</h2>
        <Status state={dashboard.setup.productionGate} />
      </div>
      <EmptyState text="אין שינויים שממתינים לאישור." />
    </section>
  );
}

function AuditPanel({ items }: { items: unknown[] }) {
  return (
    <section className="smith-card smith-audit-panel">
      <div className="smith-panel-heading">
        <div>
          <h2>Audit Trail</h2>
          <p>פעולות אמיתיות בלבד, ללא secrets.</p>
        </div>
        <a href="/admin/smith/audit">הצג הכול</a>
      </div>
      {items.length ? (
        <p>{items.length} פעולות זמינות להצגה.</p>
      ) : (
        <EmptyState text="אין פעילות להצגה." />
      )}
    </section>
  );
}

function Status({ state }: { state: SmithConnectionState }) {
  return (
    <span className="smith-connection-status" data-state={state}>
      {connectionLabels[state]}
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
    loading: ["טוען את מרכז הבקרה…", "בודק הרשאת Admin ומצב integrations."],
    unauthorized: ["נדרשת כניסת מנהל", "יש להתחבר דרך ממשק ה־Admin."],
    forbidden: ["אין הרשאת מנהל", "החשבון המחובר אינו מורשה ל־Control Center."],
    error: [
      "לא ניתן לטעון את Smith",
      "המערכת לא דיווחה הצלחה. אפשר לנסות שוב.",
    ],
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
