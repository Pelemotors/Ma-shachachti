"use client";

import { useEffect } from "react";
import type {
  AdminAiMetrics,
  AdminHealth,
  AdminIncidentsResponse,
  AdminOverview,
  AdminTasks,
  AdminUsers,
  OperationalEvent,
} from "@/lib/admin-control-contract";

export type OperationalDetail =
  | "system"
  | "active-users"
  | "pending-users"
  | "tasks"
  | "ai"
  | "incidents"
  | "application"
  | "auth"
  | "smith"
  | "preview"
  | "production"
  | { event: OperationalEvent };

export function OperationalDetailDrawer({
  detail,
  overview,
  health,
  ai,
  incidents,
  tasks,
  users,
  updatedAt,
  refreshing,
  onRefresh,
  onClose,
}: {
  detail: OperationalDetail | null;
  overview: AdminOverview;
  health: AdminHealth | null;
  ai: AdminAiMetrics | null;
  incidents: AdminIncidentsResponse | null;
  tasks: AdminTasks | null;
  users: AdminUsers | null;
  updatedAt: string;
  refreshing: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!detail) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [detail, onClose]);

  if (!detail) return null;
  const content = drawerContent({
    detail,
    overview,
    health,
    ai,
    incidents,
    tasks,
    users,
  });

  return (
    <div className="operational-drawer-layer">
      <button
        className="operational-drawer-backdrop"
        onClick={onClose}
        aria-label="סגירת חלון הפרטים"
      />
      <aside
        className="operational-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operational-drawer-title"
      >
        <header>
          <div>
            <p>OPERATIONAL DETAIL</p>
            <h2 id="operational-drawer-title">{content.title}</h2>
            <span data-state={content.state}>{content.status}</span>
          </div>
          <button onClick={onClose} aria-label="סגירת פרטים" autoFocus>
            ×
          </button>
        </header>
        <div className="operational-drawer-freshness">
          <span>עודכן: {new Date(updatedAt).toLocaleString("he-IL")}</span>
          <button onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "מרענן…" : "רענון"}
          </button>
        </div>
        <div className="operational-drawer-body">{content.body}</div>
        <details className="operational-technical-details">
          <summary>פרטים טכניים ומקור הנתונים</summary>
          <dl>
            <div>
              <dt>מקור</dt>
              <dd dir="ltr">{content.source}</dd>
            </div>
            <div>
              <dt>חלון זמן</dt>
              <dd>{content.window}</dd>
            </div>
          </dl>
          <pre dir="ltr">{JSON.stringify(content.raw, null, 2)}</pre>
        </details>
      </aside>
    </div>
  );
}

function drawerContent(input: {
  detail: OperationalDetail;
  overview: AdminOverview;
  health: AdminHealth | null;
  ai: AdminAiMetrics | null;
  incidents: AdminIncidentsResponse | null;
  tasks: AdminTasks | null;
  users: AdminUsers | null;
}) {
  const { detail, overview, health, ai, incidents, tasks, users } = input;
  if (typeof detail === "object") {
    const event = detail.event;
    return {
      title: eventTitle(event.event_type),
      status: event.event_type.includes("failure")
        ? "כשל מתועד"
        : "אירוע מתועד",
      state: event.event_type.includes("failure") ? "failed" : "connected",
      source: "GET /api/admin/activity → public.activity_events",
      window: "האירוע הבודד שנבחר",
      raw: event,
      body: (
        <DetailList
          rows={[
            ["סוג", event.event_type],
            ["זמן", new Date(event.created_at).toLocaleString("he-IL")],
            ["מערכת", subsystemLabel(event.event_type)],
            ["מזהה", event.id],
          ]}
        />
      ),
    };
  }

  if (detail === "system" || detail === "application") {
    return {
      title: detail === "application" ? "Application" : "בריאות מערכת",
      status: health?.database === "healthy" ? "תקין" : "דורש בדיקה",
      state: health?.database === "healthy" ? "connected" : "failed",
      source: "GET /api/admin/health",
      window: "בדיקה בזמן טעינת הדשבורד",
      raw: health,
      body: (
        <DetailList
          rows={[
            ["Database", health?.database ?? "אין נתונים"],
            ["DB latency", health ? `${health.latencyMs}ms` : "אין נתונים"],
            ["OpenAI", health?.serviceDetails.openai.status ?? "אין נתונים"],
            ["Push", health?.serviceDetails.push.status ?? "אין נתונים"],
            ["Cron", health?.serviceDetails.cron.status ?? "אין נתונים"],
            [
              "בדיקה מוצלחת אחרונה",
              health?.checkedAt
                ? new Date(health.checkedAt).toLocaleString("he-IL")
                : "אין נתונים",
            ],
            [
              "כשל אחרון",
              health?.serviceDetails.openai.lastFailureCode ?? "אין נתונים",
            ],
          ]}
        />
      ),
    };
  }

  if (detail === "active-users") {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1_000;
    const signedIn =
      users?.users.filter(
        (user) =>
          user.lastSignInAt && new Date(user.lastSignInAt).getTime() >= cutoff,
      ) ?? [];
    return {
      title: "משתמשים פעילים",
      status: `${overview.stats.active7} זוהו`,
      state: "connected",
      source: "GET /api/admin/overview + GET /api/admin/users",
      window: "7 ימים",
      raw: {
        activeHeuristic: overview.stats.active7,
        recentSignIns: signedIn.length,
      },
      body: (
        <>
          <p className="operational-note">
            הספירה היא union של כניסות, אירועים ועדכוני משימות. הרשימה מציגה רק
            כניסות שניתן לייחס ישירות למשתמש.
          </p>
          <EntityList
            empty="אין כניסות אחרונות להצגה."
            items={signedIn.map((user) => ({
              title: user.email,
              detail: user.lastSignInAt
                ? new Date(user.lastSignInAt).toLocaleString("he-IL")
                : "",
            }))}
          />
        </>
      ),
    };
  }

  if (detail === "pending-users") {
    const pending = users?.users.filter((user) => !user.approved) ?? [];
    return {
      title: "משתמשים ממתינים לאישור",
      status: `${pending.length} ממתינים`,
      state: pending.length ? "warning" : "connected",
      source: "GET /api/admin/users",
      window: "מצב נוכחי",
      raw: { count: pending.length },
      body: (
        <>
          <EntityList
            empty="אין משתמשים שממתינים לאישור."
            items={pending.map((user) => ({
              title: user.email,
              detail: `נוצר: ${new Date(user.createdAt).toLocaleString("he-IL")}`,
            }))}
          />
          <a className="operational-deep-link" href="/admin">
            פתיחת ניהול משתמשים
          </a>
        </>
      ),
    };
  }

  if (detail === "tasks") {
    return {
      title: "מדדי משימות",
      status: `${tasks?.total ?? overview.stats.tasks} משימות`,
      state: "connected",
      source: "GET /api/admin/tasks",
      window: "מצב נוכחי",
      raw: tasks,
      body: (
        <DetailList
          rows={[
            ["סה״כ", tasks?.total ?? overview.stats.tasks],
            ...Object.entries(tasks?.byStatus ?? {}).map(
              ([key, value]) =>
                [`סטטוס ${key}`, value] as [string, string | number],
            ),
          ]}
        />
      ),
    };
  }

  if (detail === "ai") {
    return {
      title: "ביצועי AI",
      status:
        ai?.successRate == null ? "אין נתונים" : `${ai.successRate}% הצלחה`,
      state: ai?.failures ? "warning" : "connected",
      source: "GET /api/admin/ai → public.activity_events",
      window: `${ai?.windowDays ?? 30} ימים, עד ${ai?.sampleLimit ?? 500} אירועים`,
      raw: ai,
      body: ai ? (
        <>
          <DetailList
            rows={[
              ["ניסיונות", ai.attempts],
              ["הצליחו", ai.successes],
              ["נכשלו", ai.failures],
              [
                "שיעור הצלחה",
                ai.successRate == null ? "אין נתונים" : `${ai.successRate}%`,
              ],
              ["ממוצע", metricMs(ai.averageLatencyMs)],
              ["חציון", metricMs(ai.medianLatencyMs)],
              ["p95", metricMs(ai.p95LatencyMs)],
              ["גודל מדגם latency", ai.latencySampleCount],
              ["הצלחות עם retry", ai.successfulCallsWithRetry],
              [
                "בדיקה/הצלחה אחרונה",
                ai.lastSuccessAt
                  ? new Date(ai.lastSuccessAt).toLocaleString("he-IL")
                  : "אין נתונים",
              ],
              [
                "כשל אחרון",
                ai.lastFailureAt
                  ? new Date(ai.lastFailureAt).toLocaleString("he-IL")
                  : "אין נתונים",
              ],
              ["מודלים שנשמרו בטלמטריה", ai.models.join(", ") || "אין נתונים"],
            ]}
          />
          <p className="operational-note">
            latency מודד הכנת החלטה בצד השרת: Auth, DB/context, OpenAI ושמירת
            החלטה. הוא אינו זמן OpenAI טהור ואינו round-trip מלא לדפדפן.
          </p>
          <EntityList
            empty="אין כשלים אחרונים."
            items={ai.recentFailures.map((failure) => ({
              title: failure.code,
              detail: `${new Date(failure.createdAt).toLocaleString("he-IL")} · ${metricMs(failure.latencyMs)}`,
            }))}
          />
        </>
      ) : (
        <p>אין נתוני AI זמינים.</p>
      ),
    };
  }

  if (detail === "incidents") {
    return {
      title: "תקלות אחרונות",
      status: incidents
        ? `${incidents.occurrenceCount} הופעות · ${incidents.unresolvedCount} לא פתורות`
        : "אין נתונים",
      state: incidents?.unresolvedCount ? "failed" : "connected",
      source: "GET /api/admin/incidents → public.activity_events",
      window: `${incidents?.windowDays ?? 7} ימים`,
      raw: incidents,
      body: (
        <div className="incident-detail-list">
          {(incidents?.incidents ?? []).map((incident) => (
            <article key={incident.id} data-state={incident.status}>
              <div>
                <strong>{incident.title}</strong>
                <span dir="ltr">{incident.eventType}</span>
              </div>
              <b>
                {incident.occurrenceCount}× ·{" "}
                {incident.status === "resolved" ? "נפתר" : "לא נפתר"}
              </b>
              <small>
                ראשון: {new Date(incident.firstSeen).toLocaleString("he-IL")}
              </small>
              <small>
                אחרון: {new Date(incident.lastSeen).toLocaleString("he-IL")}
              </small>
              <small>
                קוד/הודעה:{" "}
                {incident.latestCode ?? incident.latestMessage ?? "אין נתונים"}
              </small>
              <a
                href={`/admin/smith/events?type=${encodeURIComponent(incident.eventType)}`}
              >
                הצג אירועים קשורים
              </a>
            </article>
          ))}
        </div>
      ),
    };
  }

  if (detail === "auth") {
    return {
      title: "Auth",
      status: "מחובר",
      state: "connected",
      source: "Admin Bearer session + authorizeAdmin",
      window: "הבקשה הנוכחית",
      raw: { authorized: true, role: "admin", approved: true },
      body: (
        <p className="operational-note">
          הדשבורד נטען רק לאחר אימות session והרשאת Admin מאושרת בצד השרת.
        </p>
      ),
    };
  }

  const disabled = {
    smith: {
      title: "Smith Agent",
      status: "OFF — deliberately disabled",
      text: "האוטונומיה כבויה במכוון. כלי ה־Admin הדטרמיניסטיים פעילים בלעדיה.",
    },
    preview: {
      title: "Preview",
      status: "DISCONNECTED",
      text: "אין Preview Provider מחובר ואין יצירת Preview אוטונומית.",
    },
    production: {
      title: "Production Executor",
      status: "DISCONNECTED",
      text: "אין נתיב פעיל ל־Production mutation.",
    },
  }[detail];
  return {
    title: disabled.title,
    status: disabled.status,
    state: "disconnected",
    source: "Fail-closed configuration",
    window: "מצב מכוון",
    raw: { enabled: false },
    body: <p className="operational-note">{disabled.text}</p>,
  };
}

function DetailList({
  rows,
}: {
  rows: Array<[string, string | number | null | undefined]>;
}) {
  return (
    <dl className="operational-detail-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? "אין נתונים"}</dd>
        </div>
      ))}
    </dl>
  );
}

function EntityList({
  items,
  empty,
}: {
  items: Array<{ title: string; detail: string }>;
  empty: string;
}) {
  if (!items.length) return <p className="smith-empty">{empty}</p>;
  return (
    <ul className="operational-entity-list">
      {items.map((item, index) => (
        <li key={`${item.title}-${index}`}>
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function metricMs(value: number | null) {
  return value == null ? "אין נתונים" : `${value}ms`;
}

function subsystemLabel(eventType: string) {
  if (eventType.startsWith("ai.")) return "AI";
  if (eventType.startsWith("cron.reminders.")) return "Reminders";
  if (eventType.startsWith("push.")) return "Push";
  if (eventType.startsWith("auth.")) return "Auth";
  if (eventType.startsWith("database.")) return "Database";
  return "System";
}

function eventTitle(eventType: string) {
  if (eventType === "ai.failure") return "כשל AI";
  if (eventType === "ai.success") return "הצלחת AI";
  if (eventType === "cron.reminders.failure") return "כשל תזכורות";
  if (eventType === "cron.reminders.success") return "הצלחת תזכורות";
  return eventType;
}
