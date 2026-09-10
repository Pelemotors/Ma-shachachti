"use client";

import "./admin.css";
import { useEffect, useState } from "react";
import { authFetch, supabase } from "@/lib/supabase-browser";

type U = {
  id: string;
  email?: string;
  emailConfirmed: boolean;
  role: "user" | "admin";
  approved: boolean;
  createdAt: string;
  lastSignInAt?: string | null;
};
type O = {
  stats: {
    users: number;
    approved: number;
    pending: number;
    active7: number;
    tasks: number;
    completed: number;
    ai7: number;
    aiAttempts7?: number;
    aiFailures7?: number;
    aiAverageLatencyMs?: number | null;
    reminders7: number;
    reminderErrors: number;
  };
  series: { date: string; events: number; ai: number; aiFailures?: number }[];
  recent: { event_type: string; created_at: string }[];
};
type H = {
  database: string;
  latencyMs: number;
  services: Record<string, boolean>;
  serviceDetails?: Record<
    string,
    {
      configured?: boolean;
      status?: string;
      lastTestedAt?: string | null;
      lastRunAt?: string | null;
    }
  >;
  checkedAt: string;
};
type A = {
  attempts: number;
  successes: number;
  failures: number;
  successRate: number | null;
  averageLatencyMs: number | null;
  failureCodes: Record<string, number>;
  lastTestedAt: string | null;
};
type Activity = { id: string; event_type: string; created_at: string };
type TaskMetrics = {
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
};
type Tab = "overview" | "users" | "activity" | "ai" | "system";

const tabs: [Tab, string, string][] = [
  ["overview", "סקירה", "⌂"],
  ["users", "משתמשים", "♙"],
  ["activity", "פעילות", "◫"],
  ["ai", "AI", "✦"],
  ["system", "מערכת", "⚙"],
];

export default function Admin() {
  const [users, setUsers] = useState<U[]>([]);
  const [o, setO] = useState<O | null>(null);
  const [h, setH] = useState<H | null>(null);
  const [ai, setAi] = useState<A | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<TaskMetrics | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const [ur, or, hr, ar, air, tr] = await Promise.all([
      authFetch("/api/admin/users", { cache: "no-store" }),
      authFetch("/api/admin/overview", { cache: "no-store" }),
      authFetch("/api/admin/health", { cache: "no-store" }),
      authFetch("/api/admin/activity?limit=100", { cache: "no-store" }),
      authFetch("/api/admin/ai", { cache: "no-store" }),
      authFetch("/api/admin/tasks", { cache: "no-store" }),
    ]);
    if (!ur.ok) {
      setReady(false);
      setAccessDenied(ur.status === 403);
      setLoading(false);
      return false;
    }
    setUsers((await ur.json()).users);
    if (or.ok) setO(await or.json());
    if (hr.ok) setH(await hr.json());
    if (ar.ok) setActivity((await ar.json()).events ?? []);
    if (air.ok) setAi(await air.json());
    if (tr.ok) setTasks(await tr.json());
    setAccessDenied(false);
    setReady(true);
    setLoading(false);
    return true;
  }

  useEffect(() => {
    void load();
    const listener = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setReady(false);
        setAccessDenied(false);
      }
      if (event === "TOKEN_REFRESHED") void load();
    });
    return () => listener?.data.subscription.unsubscribe();
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const result = await supabase?.auth.signInWithPassword({ email, password });
    if (result?.error) return setError("פרטי הכניסה אינם נכונים.");
    if (!(await load())) setError("החשבון אינו מורשה לממשק הניהול.");
  }

  async function upd(u: U, patch: object) {
    setError("");
    const r = await authFetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id, ...patch }),
    });
    if (!r.ok)
      return setError(
        (await r.json().catch(() => null))?.error ?? "העדכון נכשל",
      );
    await load();
  }

  if (loading && !ready)
    return (
      <div className="admin">
        <div className="admin-login">
          <h2>טוען Control Room…</h2>
        </div>
      </div>
    );

  if (!ready && accessDenied)
    return (
      <div className="admin">
        <div className="admin-login admin-card">
          <p className="admin-eyebrow">מה שכחתי? · CONTROL ROOM</p>
          <h1>אין הרשאת מנהל</h1>
          <p>החשבון מחובר, אבל אין לו הרשאה ל־Control Room.</p>
          <button
            className="admin-btn primary"
            onClick={() => (location.href = "/app")}
          >
            חזרה לאפליקציה
          </button>
          <button
            className="admin-btn"
            onClick={() => supabase?.auth.signOut()}
          >
            יציאה מהחשבון
          </button>
        </div>
      </div>
    );

  if (!ready)
    return (
      <div className="admin">
        <div className="admin-login admin-card">
          <p className="admin-eyebrow">מה שכחתי? · CONTROL ROOM</p>
          <h1>כניסת מנהל</h1>
          <form onSubmit={login}>
            <input
              dir="ltr"
              type="email"
              autoComplete="email"
              placeholder="אימייל"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              dir="ltr"
              type="password"
              autoComplete="current-password"
              placeholder="סיסמה"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="admin-btn primary">כניסה</button>
          </form>
          {error && <p className="admin-error">{error}</p>}
        </div>
      </div>
    );

  const s = o?.stats;
  const filtered = users.filter((u) =>
    (u.email ?? "").toLowerCase().includes(q.toLowerCase()),
  );
  const max = Math.max(1, ...(o?.series ?? []).map((x) => x.events));

  return (
    <div className="admin">
      <div className="admin-shell">
        <aside className="admin-side">
          <div className="admin-logo">
            מה שכחתי? <span>✦</span>
          </div>
          <nav className="admin-nav">
            {tabs.map(([id, label, icon]) => (
              <button
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
                key={id}
              >
                {icon}　{label}
                {id === "users" && s?.pending ? ` · ${s.pending}` : ""}
              </button>
            ))}
          </nav>
        </aside>

        <main className="admin-content">
          <header className="admin-head">
            <div>
              <p className="admin-eyebrow">CONTROL ROOM</p>
              <h1>ניהול המערכת</h1>
            </div>
            <button
              className="admin-btn"
              onClick={() => supabase?.auth.signOut()}
            >
              יציאה
            </button>
          </header>

          {tab === "overview" && (
            <>
              <div className="admin-grid">
                <K n={s?.users} t="סה״כ משתמשים" />
                <K n={s?.active7} t="פעילים השבוע" />
                <K n={s?.pending} t="ממתינים לאישור" />
                <K n={tasks?.total ?? s?.tasks} t="משימות במערכת" />
              </div>
              <div className="admin-two admin-section">
                <section className="admin-card">
                  <h2>פעילות ב־7 ימים האחרונים</h2>
                  <div className="admin-bars">
                    {o?.series.map((x) => (
                      <div className="admin-bar-wrap" key={x.date}>
                        <div
                          className="admin-bar"
                          style={{
                            height: `${Math.max(4, (x.events / max) * 100)}%`,
                          }}
                        />
                        <span>{x.date.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section
                  className={`admin-card ${s?.pending ? "admin-alert" : ""}`}
                >
                  <h2>דורש טיפול</h2>
                  {s?.pending ? (
                    <>
                      <strong style={{ fontSize: 36 }}>{s.pending}</strong>
                      <p>משתמשים מחכים לאישור</p>
                      <button
                        className="admin-btn primary"
                        onClick={() => setTab("users")}
                      >
                        טיפול עכשיו
                      </button>
                    </>
                  ) : (
                    <p>אין כרגע אישורים שממתינים לטיפול ✓</p>
                  )}
                </section>
              </div>
              <div className="admin-two admin-section">
                <section className="admin-card">
                  <h2>פעילות אחרונה</h2>
                  {activity.slice(0, 6).map((e) => (
                    <div className="admin-system-row" key={e.id}>
                      <strong>{e.event_type}</strong>
                      <small>
                        {new Date(e.created_at).toLocaleString("he-IL")}
                      </small>
                    </div>
                  ))}
                  {!activity.length && (
                    <p className="admin-empty">עדיין אין אירועים מתועדים.</p>
                  )}
                </section>
                <section className="admin-card">
                  <h2>AI ותזכורות</h2>
                  <K n={ai?.successes ?? s?.ai7} t="הצלחות AI השבוע" />
                  <div style={{ height: 10 }} />
                  <K n={s?.reminders7} t="תזכורות השבוע" />
                </section>
              </div>
            </>
          )}

          {tab === "users" && (
            <section>
              <div className="admin-card">
                <h2>ניהול משתמשים</h2>
                <input
                  className="admin-search"
                  dir="ltr"
                  placeholder="חיפוש לפי אימייל"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="admin-users">
                {filtered.map((u) => (
                  <article className="admin-card admin-user" key={u.id}>
                    <div>
                      <div className="admin-user-email">{u.email}</div>
                      <div className="admin-statuses">
                        <P
                          ok={u.approved}
                          text={`גישה: ${u.approved ? "פעילה" : "ממתינה/חסומה"}`}
                        />
                        <P
                          ok={u.role === "admin"}
                          text={`ניהול: ${u.role === "admin" ? "Admin" : "ללא"}`}
                        />
                        <P
                          ok={u.emailConfirmed}
                          text={`מייל: ${u.emailConfirmed ? "מאומת" : "לא מאומת"}`}
                        />
                      </div>
                      {u.lastSignInAt && (
                        <small>
                          כניסה אחרונה:{" "}
                          {new Date(u.lastSignInAt).toLocaleString("he-IL")}
                        </small>
                      )}
                    </div>
                    <div className="admin-actions">
                      {!u.approved ? (
                        <button
                          className="admin-btn primary"
                          onClick={() => upd(u, { approved: true })}
                        >
                          אישור גישה
                        </button>
                      ) : (
                        u.role !== "admin" && (
                          <button
                            className="admin-btn"
                            onClick={() => upd(u, { approved: false })}
                          >
                            חסימה
                          </button>
                        )
                      )}
                      {!u.emailConfirmed && (
                        <button
                          className="admin-btn"
                          onClick={() => upd(u, { confirmEmail: true })}
                        >
                          אימות מייל
                        </button>
                      )}
                      <button
                        className="admin-btn"
                        onClick={() =>
                          upd(u, {
                            role: u.role === "admin" ? "user" : "admin",
                          })
                        }
                      >
                        {u.role === "admin" ? "הסרת Admin" : "הוספת Admin"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {tab === "activity" && (
            <section className="admin-card">
              <h2>פעילות ושימוש</h2>
              {activity.map((e) => (
                <div className="admin-system-row" key={e.id}>
                  <strong>{e.event_type}</strong>
                  <span>{new Date(e.created_at).toLocaleString("he-IL")}</span>
                </div>
              ))}
              {!activity.length && (
                <p className="admin-empty">עדיין אין פעילות מתועדת.</p>
              )}
            </section>
          )}

          {tab === "ai" && (
            <>
              <div className="admin-grid">
                <K n={ai?.attempts} t="ניסיונות AI השבוע" />
                <K n={ai?.successes} t="הצלחות" />
                <K n={ai?.failures} t="כישלונות" />
                <K n={ai?.averageLatencyMs ?? undefined} t="זמן ממוצע ms" />
              </div>
              <section className="admin-card admin-section">
                <h2>AI</h2>
                <p>
                  הנתונים מבוססים על קריאות AI שהסתיימו בפועל. תוכן שיחות
                  ומפתחות אינם נחשפים כאן.
                </p>
                <p>שיעור הצלחה: {ai?.successRate == null ? "—" : `${ai.successRate}%`}</p>
                {Object.keys(ai?.failureCodes ?? {}).length ? (
                  <div>
                    {Object.entries(ai?.failureCodes ?? {}).map(([code, count]) => (
                      <div className="admin-system-row" key={code}>
                        <strong>{code}</strong>
                        <span>{count}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {ai?.lastTestedAt && (
                  <small>
                    בדיקה אחרונה:{" "}
                    {new Date(ai.lastTestedAt).toLocaleString("he-IL")}
                  </small>
                )}
              </section>
            </>
          )}

          {tab === "system" && (
            <section className="admin-card">
              <h2>מצב מערכת</h2>
              <div className="admin-system">
                <div className="admin-system-row">
                  <strong>Database</strong>
                  <span>
                    {h?.database ?? "בודק"} · {h?.latencyMs ?? "—"}ms
                  </span>
                </div>
                {h &&
                  Object.entries(h.services).map(([name, ok]) => (
                    <div className="admin-system-row" key={name}>
                      <strong>{name}</strong>
                      <span>{ok ? "● תקין" : "○ לא אומת/דורש טיפול"}</span>
                    </div>
                  ))}
                <div className="admin-system-row">
                  <strong>שגיאות תזכורת</strong>
                  <span>{s?.reminderErrors ?? 0}</span>
                </div>
              </div>
              <button
                className="admin-btn"
                style={{ marginTop: 18 }}
                onClick={() => void load()}
              >
                רענון בדיקות
              </button>
            </section>
          )}

          {error && <p className="admin-error">{error}</p>}
        </main>

        <nav className="admin-mobile-nav">
          {tabs.map(([id, label, icon]) => (
            <button
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
              key={id}
            >
              <div>{icon}</div>
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function K({ n, t }: { n?: number; t: string }) {
  return (
    <div className="admin-card admin-kpi">
      <strong>{n ?? 0}</strong>
      <span>{t}</span>
    </div>
  );
}

function P({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className={`admin-pill ${ok ? "ok" : ""}`}>
      {ok ? "● " : "○ "}
      {text}
    </span>
  );
}
