"use client";
import { useState, useEffect, useRef } from "react";
import {
  Home,
  MessageCircle,
  CheckCheck,
  ShoppingBasket,
  Plus,
  ArrowUp,
  ArrowRight,
  Clock3,
  Sparkles,
  CalendarDays,
  SlidersHorizontal,
  Bell,
  Leaf,
  Search,
  Check,
  Undo2,
  Download,
  LogOut,
  Trash2,
  Pencil,
  BookOpen,
  ChevronLeft,
} from "lucide-react";
import { Action, AppState, Task, categories } from "@/lib/model";
import {
  whatMatters,
  opportunities,
  planDay,
  estimatedMinutes,
  requiresConfirmation,
  learning,
  activeFacts,
  visible,
  blocked,
} from "@/lib/engine";
import { suggestions, catalog, templateAction } from "@/lib/catalog";
import { formatTime } from "@/lib/time";
import { consumptionInsights, calendarSuggestions } from "@/lib/insights";
import { useHousehold } from "@/lib/use-household";
import { supabase, authHeaders } from "@/lib/supabase-browser";
import { Dialog } from "./dialog";
import { TaskEditor } from "./task-editor";
import { VoiceButton } from "./voice-button";
import { ProfileForm } from "./profile-form";

type View =
  | "home"
  | "chat"
  | "tasks"
  | "shopping"
  | "memory"
  | "settings"
  | "reminders"
  | "kit"
  | "history"
  | "focus"
  | "plan"
  | "free";
const titles: Record<View, string> = {
  home: "הבית שלך",
  chat: "אני כאן איתך",
  tasks: "המשימות שלי",
  shopping: "רשימת קניות",
  memory: "מה אני זוכר",
  settings: "הבית וההעדפות",
  reminders: "תזכורות",
  kit: "מתאים לבית שלכם?",
  history: "מה כבר נעשה",
  focus: "מה שכחתי?",
  plan: "נעשה סדר ביום",
  free: "זמן בשביל מה שמתאים",
};
function describe(a: Action): string {
  switch (a.type) {
    case "task.create":
      return `${a.task.kind === "idea" ? "רעיון" : "משימה"}: ${a.task.title}`;
    case "shopping.add":
      return `לקניות: ${a.title}`;
    case "fact.add":
      return `לזיכרון: ${a.text}`;
    case "reminder.add":
      return `תזכורת: ${a.title}`;
    case "task.defer":
      return "להוריד משימה מהתוכנית להיום";
    case "task.status":
      return a.status === "done"
        ? "סימון משימה כבוצעה"
        : a.status === "cancelled"
          ? "ביטול משימה"
          : "עדכון מצב משימה";
    case "task.update":
      return "עדכון פרטי משימה";
    case "fact.remove":
      return "הסרת פרט מהזיכרון";
    case "shopping.remove":
      return "הסרת פריט קניות";
    case "history.clear":
      return "מחיקת השיחות והיסטוריית הפעולות";
    default:
      return "עדכון במידע של הבית";
  }
}
function demoReply(
  text: string,
  state: AppState,
  context: string | null,
): { reply: string; actions: Action[] } {
  const clean = text.trim();
  if (/^אולי\s/.test(clean))
    return {
      reply: "אפשר לשמור את זה כרעיון, בלי להתחייב להיום.",
      actions: [
        {
          type: "task.create",
          task: { title: clean.replace(/^אולי\s+/, ""), kind: "idea" },
        },
      ],
    };
  if (/^(צריך|צריכה|חייב|חייבת)\s/.test(clean) && !/[,.\n]/.test(clean))
    return {
      reply: "אפשר להוסיף את זה לרשימה.",
      actions: [
        {
          type: "task.create",
          task: {
            title: clean.replace(/^(צריך|צריכה|חייב|חייבת)\s+/, ""),
            kind: "task",
          },
        },
      ],
    };
  if (context && /לא היום/.test(clean))
    return {
      reply: "אפשר להוריד את המשימה מהתוכנית להיום ולהשאיר אותה פתוחה.",
      actions: [{ type: "task.defer", id: context }],
    };
  if (context && /^(סיימתי|בוצע)/.test(clean))
    return {
      reply: "אפשר לסמן את המשימה שבחרת כבוצעה.",
      actions: [{ type: "task.status", id: context, status: "done" }],
    };
  return {
    reply:
      "זו שיחת הדגמה עם הבנה בסיסית בלבד. אפשר לנסות ״צריך לקפל כביסה״ או ״אולי להכין פשטידה״, או להוסיף משימה דרך כפתור הפלוס. שיחה חופשית זמינה לאחר חיבור הסוכן.",
    actions: [],
  };
}
function TaskCard({
  task: t,
  state,
  busy,
  clock,
  detailed,
  onEdit,
  onChat,
  onComplete,
  onAction,
}: {
  task: Task;
  state: AppState;
  busy: boolean;
  clock: Date;
  detailed: boolean;
  onEdit: (t: Task) => void;
  onChat: (t: Task) => void;
  onComplete: (t: Task) => void;
  onAction: (a: Action) => Promise<void>;
}) {
  const isDone = t.status === "done";
  return (
    <article className={"task-card " + (isDone ? "is-done" : "")}>
      <div className="task-top">
        <button
          className="task-check"
          aria-label={
            isDone ? "החזרת " + t.title + " לרשימה" : "סיום " + t.title
          }
          disabled={busy}
          onClick={() =>
            isDone
              ? void onAction({ type: "task.status", id: t.id, status: "open" })
              : onComplete(t)
          }
        >
          {isDone && <Check size={17} />}
        </button>
        <button className="task-title" onClick={() => onEdit(t)}>
          <strong>{t.title}</strong>
          <span>
            {t.kind === "idea" ? "רעיון, אם יתאים · " : ""}
            {t.category} · {estimatedMinutes(t, state)} דק׳
            {t.waitMinutes > 0 ? ` + ${t.waitMinutes} דק׳ המתנה` : ""}
          </span>
        </button>
        <button
          className="icon-button"
          aria-label={"שיחה על " + t.title}
          onClick={() => onChat(t)}
        >
          <MessageCircle size={18} />
        </button>
      </div>
      {t.dueAt && (
        <p
          className={
            "task-meta " +
            (new Date(t.dueAt) < clock && !isDone ? "attention" : "")
          }
        >
          <Clock3 size={14} />
          {formatTime(t.dueAt, state.profile.timezone)}
          {!isDone && new Date(t.dueAt) < clock
            ? " · המועד חלף, כדאי לבדוק אם בוצע"
            : ""}
        </p>
      )}
      {t.hiddenUntil && new Date(t.hiddenUntil) > clock && (
        <p className="task-meta">
          ממתינה להמשך · {formatTime(t.hiddenUntil, state.profile.timezone)}
        </p>
      )}
      {t.status === "unknown" && (
        <p className="task-meta">לא ידוע אם כבר בוצע</p>
      )}
      {blocked(t, state) && (
        <p className="task-meta">
          קודם:{" "}
          {t.dependsOn
            .map((id) => state.tasks.find((x) => x.id === id))
            .filter((x) => x?.status !== "done")
            .map((x) => x?.title)
            .join(", ")}
        </p>
      )}
      {detailed && (
        <>
          <div className="task-steps">
            {t.steps.map((step) => (
              <label className="check-line" key={step.id}>
                <input
                  type="checkbox"
                  checked={step.done}
                  disabled={busy}
                  onChange={(e) =>
                    void onAction({
                      type: "task.step",
                      id: t.id,
                      stepId: step.id,
                      done: e.target.checked,
                    })
                  }
                />
                {step.title}
              </label>
            ))}
          </div>
          {t.notes && <p className="task-meta">{t.notes}</p>}
        </>
      )}
      {!isDone && t.status !== "cancelled" && (
        <div className="task-actions">
          <button
            disabled={busy}
            onClick={() => void onAction({ type: "task.defer", id: t.id })}
          >
            לא היום
          </button>
          <button onClick={() => onEdit(t)}>שינוי</button>
          {detailed && (
            <button
              disabled={busy}
              onClick={() =>
                void onAction({
                  type: "task.status",
                  id: t.id,
                  status: "cancelled",
                })
              }
            >
              ביטול משימה
            </button>
          )}
        </div>
      )}
    </article>
  );
}
function Empty({
  text,
  action,
  label,
}: {
  text: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <Leaf size={28} />
      <p>{text}</p>
      {action && (
        <button className="secondary" onClick={action}>
          {label}
        </button>
      )}
    </div>
  );
}
function ViewHeader({
  children,
  view,
}: {
  children?: React.ReactNode;
  view: View;
}) {
  return (
    <div className="section-heading">
      <h2>{titles[view]}</h2>
      {children}
    </div>
  );
}

export function HomeApp() {
  const h = useHousehold();
  const { state, mode, busy } = h;
  const [view, setView] = useState<View>("home"),
    [editor, setEditor] = useState<Task | "new" | null>(null),
    [draft, setDraft] = useState(""),
    [context, setContext] = useState<string | null>(null),
    [thinking, setThinking] = useState(false),
    [proposal, setProposal] = useState<Action[] | null>(null),
    [confirm, setConfirm] = useState<Action[] | null>(null),
    [filter, setFilter] = useState(""),
    [category, setCategory] = useState("הכול"),
    [detailed, setDetailed] = useState(false),
    [minutes, setMinutes] = useState(20),
    [effort, setEffort] = useState(2),
    [planMinutes, setPlanMinutes] = useState(120),
    [planReady, setPlanReady] = useState(false),
    [changedDay, setChangedDay] = useState(""),
    [newItem, setNewItem] = useState(""),
    [quantity, setQuantity] = useState(""),
    [factText, setFactText] = useState(""),
    [factKind, setFactKind] = useState<"stable" | "temporary">("stable"),
    [factExpiry, setFactExpiry] = useState(""),
    [reminderTitle, setReminderTitle] = useState(""),
    [reminderDue, setReminderDue] = useState(""),
    [completion, setCompletion] = useState<Task | null>(null),
    [workActual, setWorkActual] = useState(""),
    [email, setEmail] = useState(""),
    [otp, setOtp] = useState(""),
    [authSent, setAuthSent] = useState(false),
    [authBusy, setAuthBusy] = useState(false),
    [pushReady, setPushReady] = useState(false),
    [pushBusy, setPushBusy] = useState(false),
    [pushEnabled, setPushEnabled] = useState(false),
    [clock, setClock] = useState(() => new Date());
  const chatBottom = useRef<HTMLDivElement>(null),
    draftBox = useRef<HTMLTextAreaElement>(null),
    sendLock = useRef(false),
    proposalRevision = useRef(0);
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 60000);
    if (new URLSearchParams(window.location.search).get("view") === "reminders")
      setView("reminders");
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (view === "chat")
      chatBottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [view, state.messages, thinking, proposal]);
  useEffect(() => {
    if (mode !== "cloud") return;
    let alive = true;
    async function init() {
      try {
        if (!("serviceWorker" in navigator)) return;
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager?.getSubscription();
        const response = await fetch("/api/push", {
          headers: await authHeaders(),
        });
        const data = await response.json();
        if (alive) {
          setPushReady(response.ok && data.ready);
          setPushEnabled(!!sub);
        }
      } catch {
        if (alive) setPushReady(false);
      }
    }
    void init();
    return () => {
      alive = false;
    };
  }, [mode]);
  const run = async (actions: Action[], confirmed = false) => {
    await h.commit(actions, confirmed);
  };
  const act = async (a: Action) => {
    if (requiresConfirmation([a])) {
      setConfirm([a]);
      return;
    }
    try {
      await run([a]);
    } catch {}
  };
  const navigate = (v: View) => {
    setView(v);
    h.setNotice("");
  };
  const onTaskChat = (t: Task) => {
    setContext(t.id);
    setView("chat");
  };
  async function send(text = draft) {
    if (!text.trim() || thinking || busy || proposal || sendLock.current)
      return;
    sendLock.current = true;
    setThinking(true);
    const message = text.trim();
    try {
      const next = await h.commit(
        [{ type: "message.add", role: "user", text: message }],
        false,
        false,
      );
      setDraft("");
      let answer: { reply: string; actions: Action[] };
      if (mode === "local") answer = demoReply(message, next, context);
      else {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            ...(await authHeaders()),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message, contextTaskId: context }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (data.basedOnRevision !== h.currentRevision())
          throw new Error(
            "המידע השתנה בזמן השיחה. לא בוצעו שינויים; אפשר לשלוח שוב.",
          );
        answer = data;
      }
      await h.commit(
        [{ type: "message.add", role: "assistant", text: answer.reply }],
        false,
        false,
      );
      if (answer.actions.length) {
        if (state.profile.autoApply && !requiresConfirmation(answer.actions))
          await h.commit(answer.actions);
        else {
          proposalRevision.current = h.currentRevision();
          setProposal(answer.actions);
        }
      }
    } catch (e) {
      h.setError(e instanceof Error ? e.message : "השיחה התעכבה.");
      setDraft(message);
    } finally {
      sendLock.current = false;
      setThinking(false);
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setAuthBusy(true);
    h.setError("");
    try {
      if (authSent) {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token: otp,
          type: "email",
        });
        if (error) throw error;
        await h.cloudLoad();
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true },
        });
        if (error) throw error;
        setAuthSent(true);
      }
    } catch {
      h.setError(
        authSent
          ? "הקוד לא אומת. אפשר לבדוק את הקוד או לבקש קוד חדש."
          : "לא הצלחנו לשלוח קוד. אפשר לנסות שוב.",
      );
    } finally {
      setAuthBusy(false);
    }
  }
  async function enablePush() {
    setPushBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error(
          "במכשיר הזה ייתכן שצריך להוסיף את האפליקציה למסך הבית ולפתוח אותה משם.",
        );
      const status = await fetch("/api/push", { headers: await authHeaders() });
      const config = await status.json();
      if (!status.ok || !config.ready)
        throw new Error("ההתראות עדיין לא מחוברות. התזכורות נשמרות ברשימה.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "לא ניתנה הרשאה להתראות. אפשר לשנות אותה בהגדרות הדפדפן.",
        );
      const reg = await navigator.serviceWorker.ready;
      const key = Uint8Array.from(
        atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      const res = await fetch("/api/push", {
        method: "POST",
        headers: {
          ...(await authHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok)
        throw new Error("הרשאת ההתראות לא נשמרה בענן. אפשר לנסות שוב.");
      setPushEnabled(true);
      h.setNotice("המכשיר נרשם לקבלת התראות");
    } catch (e) {
      h.setError(e instanceof Error ? e.message : "לא הצלחנו להפעיל התראות");
    } finally {
      setPushBusy(false);
    }
  }
  async function disablePush() {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const res = await fetch("/api/push", {
          method: "DELETE",
          headers: {
            ...(await authHeaders()),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        if (!res.ok) throw new Error("הביטול לא נשמר");
        await sub.unsubscribe();
      }
      setPushEnabled(false);
      h.setNotice("התראות למכשיר הזה כובו");
    } catch {
      h.setError("לא הצלחנו לכבות התראות. אפשר לנסות שוב.");
    } finally {
      setPushBusy(false);
    }
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "my-home-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const relevant = whatMatters(state, clock),
    free = opportunities(state, minutes, effort, clock),
    plan = planDay(state, planMinutes, effort, clock);
  const matches = (t: Task) =>
    (category === "הכול" || t.category === category) &&
    t.title.includes(filter);
  const greeting = new Intl.DateTimeFormat("he-IL", {
    timeZone: state.profile.timezone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(clock);
  const completed = state.tasks.filter((t) => t.status === "done");
  if (mode === "loading")
    return (
      <main className="center" aria-busy="true">
        <div className="brand-mark">מ׳</div>
        <p>פותח את הבית שלך…</p>
      </main>
    );
  if (mode === "choose")
    return (
      <main className="welcome">
        <div className="brand-mark">מ׳</div>
        <p className="eyebrow">מה שכחתי?</p>
        <h1>
          קצת פחות בראש.
          <br />
          קצת יותר מקום לך.
        </h1>
        <p>
          משימות, מחשבות ותוכנית ליום שלך.
          <br />
          אפשר להתחיל בקטן.
        </p>
        {supabase && (
          <form onSubmit={login} className="panel stack">
            <h2>כניסה לבית שלך</h2>
            <label>
              כתובת אימייל
              <input
                type="email"
                dir="ltr"
                required
                value={email}
                disabled={authSent}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {authSent && (
              <>
                <label>
                  הקוד שקיבלת באימייל
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setAuthSent(false)}
                >
                  שליחת קוד חדש או שינוי כתובת
                </button>
              </>
            )}
            <button className="primary" disabled={authBusy}>
              {authBusy ? "רגע…" : authSent ? "כניסה" : "שלחו לי קוד כניסה"}
            </button>
          </form>
        )}
        <button
          className={supabase ? "secondary" : "primary"}
          onClick={h.startLocal}
        >
          להתנסות במכשיר הזה
        </button>
        <small>
          הדגמה מקומית, ללא חשבון וללא סוכן AI מחובר.
          <br />
          המידע נשמר בדפדפן הזה בלבד.
        </small>
        {h.error && (
          <p role="alert" className="error">
            {h.error}
          </p>
        )}
      </main>
    );
  if (!state.profile.onboarded)
    return (
      <main className="onboarding">
        <div className="brand-mark small">מ׳</div>
        <p className="eyebrow">היכרות קצרה</p>
        <h1>כל בית והקצב שלו.</h1>
        <p className="muted">
          כמה פרטים יעזרו לי להציע התחלה מתאימה. תמיד אפשר לשנות.
        </p>
        <section className="panel">
          <ProfileForm
            profile={state.profile}
            onboarding
            onSave={async (a) => {
              await run([a], true);
            }}
          />
        </section>
        <button
          className="text-button"
          onClick={() =>
            void act({ type: "profile.update", patch: { onboarded: true } })
          }
        >
          אפשר גם להכיר בהמשך
        </button>
        {h.error && (
          <p className="error" role="alert">
            {h.error}
          </p>
        )}
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <div className="wordmark">
          <span className="brand-mark small">מ׳</span>
          <strong>מה שכחתי?</strong>
        </div>
        <p className="muted">בקצב של הבית שלך</p>
        <nav aria-label="ניווט ראשי">
          {(
            [
              ["home", Home, "הבית שלי"],
              ["chat", MessageCircle, "שיחה"],
              ["tasks", CheckCheck, "משימות"],
              ["shopping", ShoppingBasket, "קניות"],
              ["reminders", Bell, "תזכורות"],
              ["memory", BookOpen, "הזיכרון שלי"],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              className={view === v ? "selected" : ""}
              onClick={() => navigate(v)}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => navigate("settings")}>
            <SlidersHorizontal size={18} />
            הבית וההעדפות
          </button>
          <span>פחות להחזיק בראש.</span>
        </div>
      </aside>
      <div className="main-column">
        <header className="app-header">
          <div className="mobile-brand">
            <span className="brand-mark small">מ׳</span>
            <strong>מה שכחתי?</strong>
          </div>
          <span className="desktop-date">
            {new Intl.DateTimeFormat("he-IL", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: state.profile.timezone,
            }).format(clock)}
          </span>
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="תזכורות"
              onClick={() => navigate("reminders")}
            >
              <Bell size={20} />
            </button>
            <button
              className="avatar"
              aria-label="הגדרות הבית"
              onClick={() => navigate("settings")}
            >
              {state.profile.name?.[0] ?? "מ"}
            </button>
          </div>
        </header>
        {mode === "local" && (
          <div className="demo-banner">
            הדגמה במכשיר הזה · הנתונים מקומיים והשיחה בסיסית
          </div>
        )}
        <main
          className={
            view === "chat" ? "main-content chat-page" : "main-content"
          }
        >
          {h.error && (
            <div className="error-banner" role="alert">
              <span>{h.error}</span>
              <button
                onClick={() => {
                  h.setError("");
                  if (mode === "cloud")
                    void h.cloudLoad().catch((e) => h.setError(e.message));
                }}
              >
                טעינה מחדש
              </button>
            </div>
          )}
          {view === "home" && (
            <>
              <section className="greeting">
                <p className="eyebrow">הבית שלך, בקצב שלך</p>
                <h1>
                  {+greeting < 12
                    ? "בוקר טוב"
                    : +greeting < 18
                      ? "צהריים טובים"
                      : "ערב טוב"}
                  {state.profile.name ? `, ${state.profile.name}` : ""}
                  <span className="greeting-dot">.</span>
                </h1>
                <p>מה יעזור לך עכשיו?</p>
              </section>
              <div className="engines">
                <button
                  className="engine main-engine"
                  onClick={() => navigate("focus")}
                >
                  <span className="engine-icon">
                    <Sparkles size={25} />
                  </span>
                  <span>
                    <strong>מה שכחתי?</strong>
                    <small>מה חשוב לזכור עכשיו</small>
                  </span>
                  <ChevronLeft size={21} />
                </button>
                <button
                  className="engine"
                  onClick={() => {
                    setPlanReady(false);
                    navigate("plan");
                  }}
                >
                  <span className="engine-icon">
                    <CalendarDays size={23} />
                  </span>
                  <span>
                    <strong>צור לי לו״ז להיום</strong>
                    <small>נעשה סדר ביום שלך</small>
                  </span>
                  <ChevronLeft size={21} />
                </button>
                <button className="engine" onClick={() => navigate("free")}>
                  <span className="engine-icon">
                    <Clock3 size={23} />
                  </span>
                  <span>
                    <strong>יש לי זמן פנוי</strong>
                    <small>מה מתאים לזמן ולכוח שלך</small>
                  </span>
                  <ChevronLeft size={21} />
                </button>
              </div>
              <section>
                <div className="section-heading">
                  <h2>עכשיו אצלך</h2>
                  <button
                    className="text-button"
                    onClick={() => navigate("tasks")}
                  >
                    לכל המשימות <ChevronLeft size={16} />
                  </button>
                </div>
                {relevant.length ? (
                  <div className="task-list">
                    {relevant.slice(0, 3).map((t) => (
                      <TaskCard
                        state={state}
                        busy={busy}
                        clock={clock}
                        detailed={detailed}
                        onEdit={setEditor}
                        onChat={onTaskChat}
                        onComplete={(t) => {
                          setCompletion(t);
                          setWorkActual("");
                        }}
                        onAction={act}
                        key={t.id}
                        task={t}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty
                    text="אפשר להניח כאן את הדבר הראשון שחשוב לזכור."
                    action={() => setEditor("new")}
                    label="הוספת משימה"
                  />
                )}
              </section>
              {suggestions(state).length > 0 && (
                <button className="kit-invite" onClick={() => navigate("kit")}>
                  <Leaf size={21} />
                  <span>
                    <strong>נכיר קצת את השגרה?</strong>
                    <small>כמה הצעות שמתאימות לבית שלכם</small>
                  </span>
                  <ChevronLeft size={18} />
                </button>
              )}
              <button
                className="quiet-link"
                onClick={() => navigate("history")}
              >
                מה כבר נעשה <CheckCheck size={16} />
              </button>
            </>
          )}
          {view === "tasks" && (
            <>
              <ViewHeader view={view}>
                <button
                  className="primary compact"
                  onClick={() => setEditor("new")}
                >
                  <Plus size={18} />
                  משימה
                </button>
              </ViewHeader>
              <div className="filters">
                <label className="search">
                  <Search size={18} />
                  <input
                    aria-label="חיפוש משימה"
                    placeholder="לחפש משהו ברשימה"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </label>
                <select
                  aria-label="סינון לפי תחום"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option>הכול</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="tabs">
                <button
                  className={!detailed ? "active" : ""}
                  onClick={() => setDetailed(false)}
                >
                  פשוט
                </button>
                <button
                  className={detailed ? "active" : ""}
                  onClick={() => setDetailed(true)}
                >
                  מפורט
                </button>
                <button onClick={() => navigate("kit")}>הצעות לבית</button>
              </div>
              <div className="task-list">
                {state.tasks
                  .filter(
                    (t) => ["open", "unknown"].includes(t.status) && matches(t),
                  )
                  .map((t) => (
                    <TaskCard
                      state={state}
                      busy={busy}
                      clock={clock}
                      detailed={detailed}
                      onEdit={setEditor}
                      onChat={onTaskChat}
                      onComplete={(t) => {
                        setCompletion(t);
                        setWorkActual("");
                      }}
                      onAction={act}
                      key={t.id}
                      task={t}
                    />
                  ))}
              </div>
              {!state.tasks.some(
                (t) => ["open", "unknown"].includes(t.status) && matches(t),
              ) && (
                <Empty
                  text="אין כרגע משימות בתצוגה הזאת."
                  action={() => setEditor("new")}
                  label="הוספת משימה"
                />
              )}
              <button
                className="quiet-link"
                onClick={() => navigate("history")}
              >
                היסטוריית ביצוע וביטולים
              </button>
            </>
          )}
          {view === "focus" && (
            <>
              <ViewHeader view={view} />
              <p className="intro">
                הדברים שכדאי לשים לב אליהם. אין דיווח? נבדוק, בלי להניח שלא
                נעשה.
              </p>
              <div className="task-list">
                {relevant.map((t) => (
                  <TaskCard
                    state={state}
                    busy={busy}
                    clock={clock}
                    detailed={detailed}
                    onEdit={setEditor}
                    onChat={onTaskChat}
                    onComplete={(t) => {
                      setCompletion(t);
                      setWorkActual("");
                    }}
                    onAction={act}
                    key={t.id}
                    task={t}
                  />
                ))}
              </div>
              {!relevant.length && (
                <Empty text="אין כרגע משהו נוסף שדורש את תשומת הלב שלך." />
              )}
              {state.reminders
                .filter(
                  (r) => r.status === "pending" && new Date(r.dueAt) <= clock,
                )
                .map((r) => (
                  <div className="callout" key={r.id}>
                    <Bell size={20} />
                    <span>{r.title} · הגיע הזמן לבדוק</span>
                  </div>
                ))}
            </>
          )}
          {view === "free" && (
            <>
              <ViewHeader view={view} />
              <p className="intro">נמצא משהו שנכנס בזמן שלך, עם מקום לנשום.</p>
              <section className="panel stack">
                <label>
                  כמה זמן פנוי יש?
                  <div className="choice-row">
                    {[20, 60, 240].map((m) => (
                      <button
                        type="button"
                        key={m}
                        className={minutes === m ? "selected" : ""}
                        onClick={() => setMinutes(m)}
                      >
                        {m === 20 ? "20 דקות" : m === 60 ? "שעה" : "חצי יום"}
                      </button>
                    ))}
                  </div>
                  <input
                    aria-label="משך אחר בדקות"
                    type="number"
                    min={1}
                    max={720}
                    value={minutes}
                    onChange={(e) =>
                      setMinutes(Math.max(1, Math.min(720, +e.target.value)))
                    }
                  />
                </label>
                <label>
                  כמה כוח מתאים להשקיע?
                  <select
                    value={effort}
                    onChange={(e) => setEffort(+e.target.value)}
                  >
                    <option value={1}>מעט, משהו קל</option>
                    <option value={2}>כוח בינוני</option>
                    <option value={3}>אפשר גם משהו מאומץ</option>
                  </select>
                </label>
              </section>
              {free.important.length > 0 && (
                <div className="callout">
                  <Bell size={20} />
                  <div>
                    <strong>חשוב לזכור, גם אם לא נכנס עכשיו</strong>
                    <p>{free.important.map((t) => t.title).join(" · ")}</p>
                  </div>
                </div>
              )}
              <div className="section-heading">
                <h2>אפשר עכשיו</h2>
              </div>
              <div className="task-list">
                {free.candidates.map((t) => (
                  <TaskCard
                    state={state}
                    busy={busy}
                    clock={clock}
                    detailed={detailed}
                    onEdit={setEditor}
                    onChat={onTaskChat}
                    onComplete={(t) => {
                      setCompletion(t);
                      setWorkActual("");
                    }}
                    onAction={act}
                    key={t.id}
                    task={t}
                  />
                ))}
              </div>
              {!free.candidates.length && (
                <Empty text="לא מצאתי משימה שמתאימה לחלון הזה. אפשר להשאיר אותו למנוחה." />
              )}
            </>
          )}
          {view === "plan" && (
            <>
              <ViewHeader view={view} />
              <p className="intro">תוכנית שאפשר לשנות תוך כדי היום.</p>
              <section className="panel stack">
                <label>
                  כמה דקות עבודה פנויות היום?
                  <input
                    type="number"
                    min={10}
                    max={720}
                    value={planMinutes}
                    onChange={(e) =>
                      setPlanMinutes(
                        Math.max(10, Math.min(720, +e.target.value)),
                      )
                    }
                  />
                </label>
                <label>
                  הכוח שלך היום
                  <select
                    value={effort}
                    onChange={(e) => setEffort(+e.target.value)}
                  >
                    <option value={1}>מעט</option>
                    <option value={2}>בינוני</option>
                    <option value={3}>הרבה</option>
                  </select>
                </label>
                <button className="primary" onClick={() => setPlanReady(true)}>
                  היום כרגיל — בנה תוכנית
                </button>
                <details>
                  <summary>יש משהו שונה היום</summary>
                  <label>
                    מה השתנה?
                    <textarea
                      value={changedDay}
                      onChange={(e) => setChangedDay(e.target.value)}
                      placeholder="למשל: יש תור בצהריים, אני לבד עם הילדים"
                    />
                  </label>
                  <button
                    className="secondary"
                    disabled={!changedDay.trim()}
                    onClick={() => {
                      setDraft(changedDay);
                      setView("chat");
                    }}
                  >
                    להתאים יחד בשיחה
                  </button>
                </details>
              </section>
              {planReady && (
                <>
                  <p className="muted">
                    סדר מוצע מהתחלת חלון העבודה. זמני המתנה יכולים לחפוף למשימות
                    אחרות.
                  </p>
                  <div className="timeline">
                    {plan.selected.map(({ task, start, end }, i) => (
                      <div className="timeline-item" key={task.id}>
                        <div className="timeline-number">{i + 1}</div>
                        <div>
                          <small>
                            דקה {start}–{end} מההתחלה
                          </small>
                          <TaskCard
                            state={state}
                            busy={busy}
                            clock={clock}
                            detailed={detailed}
                            onEdit={setEditor}
                            onChat={onTaskChat}
                            onComplete={(t) => {
                              setCompletion(t);
                              setWorkActual("");
                            }}
                            onAction={act}
                            task={task}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {!plan.selected.length && (
                    <Empty text="אין כרגע משימות שנכנסות לתוכנית הזאת. אפשר לשנות את החלון או להשאיר זמן לעצמך." />
                  )}
                  {plan.remaining.length > 0 && (
                    <p className="callout">
                      נשארו {plan.remaining.length} משימות פתוחות מחוץ לתוכנית.
                      הן לא הועברו למחר.
                    </p>
                  )}
                  <button className="secondary" onClick={() => window.print()}>
                    הדפסת התוכנית / שמירה כ־PDF
                  </button>
                </>
              )}
            </>
          )}
          {view === "shopping" && (
            <>
              <ViewHeader view={view} />
              <form
                className="add-row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await run([
                      { type: "shopping.add", title: newItem, quantity },
                    ]);
                    setNewItem("");
                    setQuantity("");
                  } catch {}
                }}
              >
                <input
                  required
                  aria-label="פריט לקניות"
                  placeholder="מה חסר בבית?"
                  value={newItem}
                  maxLength={150}
                  onChange={(e) => setNewItem(e.target.value)}
                />
                <input
                  className="quantity"
                  aria-label="כמות"
                  placeholder="כמות"
                  value={quantity}
                  maxLength={60}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <button
                  className="primary icon-button"
                  disabled={busy}
                  aria-label="הוספת פריט"
                >
                  <Plus size={20} />
                </button>
              </form>
              <div className="shopping-list">
                {[...state.shopping]
                  .sort(
                    (a, b) => Number(!!a.purchasedAt) - Number(!!b.purchasedAt),
                  )
                  .map((item) => (
                    <div
                      className={
                        "shopping-item " + (item.purchasedAt ? "is-done" : "")
                      }
                      key={item.id}
                    >
                      <label className="check-line">
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={!!item.purchasedAt}
                          onChange={(e) =>
                            void act({
                              type: "shopping.check",
                              id: item.id,
                              checked: e.target.checked,
                            })
                          }
                        />
                        <span>{item.title}</span>
                        {item.quantity && <small>{item.quantity}</small>}
                      </label>
                      <button
                        className="icon-button"
                        aria-label={"הסרת " + item.title}
                        onClick={() =>
                          void act({ type: "shopping.remove", id: item.id })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
              </div>
              {!state.shopping.length && (
                <Empty text="הרשימה מחכה לדברים שחסרים בבית." />
              )}
              <button className="secondary" onClick={() => window.print()}>
                הדפסה / שמירה כ־PDF
              </button>
            </>
          )}
          {view === "chat" && (
            <>
              <ViewHeader view={view}>
                <button
                  className="icon-button"
                  aria-label="הוספת משימה ידנית"
                  onClick={() => setEditor("new")}
                >
                  <Plus size={20} />
                </button>
              </ViewHeader>
              {context && (
                <div className="context-chip">
                  מדברים על:{" "}
                  {state.tasks.find((t) => t.id === context)?.title ?? "המשימה"}
                  <button onClick={() => setContext(null)}>סיום ההקשר</button>
                </div>
              )}
              {!state.messages.length && (
                <div className="chat-welcome">
                  <div className="brand-mark">מ׳</div>
                  <h2>אפשר פשוט לכתוב.</h2>
                  <p>
                    משהו לזכור, משהו שכבר נעשה,
                    <br />
                    או יום שצריך לעשות בו קצת סדר.
                  </p>
                  <div className="prompt-chips">
                    {[
                      "צריך לקפל כביסה",
                      "אולי להכין פשטידה",
                      "יש לי מעט כוח היום",
                    ].map((t) => (
                      <button key={t} onClick={() => setDraft(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="messages" aria-live="polite">
                {state.messages.map((m) => (
                  <div key={m.id} className={"message " + m.role}>
                    <span className="sr-only">
                      {m.role === "user" ? "ההודעה שלך" : "העוזר"}:{" "}
                    </span>
                    <p>{m.text}</p>
                  </div>
                ))}
                {thinking && (
                  <div className="message assistant">
                    <p>חושב איתך…</p>
                  </div>
                )}
                {proposal && (
                  <div className="proposal">
                    <strong>אלה השינויים המוצעים</strong>
                    <ul>
                      {proposal.map((a, i) => (
                        <li key={i}>
                          {describe(a)}
                          {"id" in a && state.tasks.find((t) => t.id === a.id)
                            ? ` — ${state.tasks.find((t) => t.id === a.id)?.title}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                    <div className="button-row">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={async () => {
                          try {
                            if (
                              proposalRevision.current !== h.currentRevision()
                            ) {
                              setProposal(null);
                              throw new Error(
                                "המידע השתנה מאז ההצעה. יש לבקש הצעה חדשה.",
                              );
                            }
                            await run(proposal, true);
                            setProposal(null);
                          } catch (e) {
                            h.setError(
                              e instanceof Error ? e.message : "לא נשמר",
                            );
                          }
                        }}
                      >
                        לאשר ולשמור
                      </button>
                      <button
                        className="secondary"
                        onClick={() => setProposal(null)}
                      >
                        לוותר
                      </button>
                    </div>
                  </div>
                )}
                <div ref={chatBottom} />
              </div>
            </>
          )}
          {view === "kit" && (
            <>
              <ViewHeader view={view} />
              {calendarSuggestions(state, clock).map((title) => (
                <article className="suggestion" key={title}>
                  <span className="tag">רעיון לפי התקופה בשנה</span>
                  <h3>{title}</h3>
                  <button
                    className="text-button"
                    onClick={() =>
                      void act({
                        type: "task.create",
                        task: { title, kind: "idea", category: "ילדים" },
                      })
                    }
                  >
                    לשמור כאפשרות
                  </button>
                </article>
              ))}
              <p className="intro">
                אלה הצעות בלבד. נבחר מה שמתאים, והשאר יכול לחכות.
              </p>
              <select
                aria-label="תחום הצעות"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>הכול</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <div className="task-list">
                {suggestions(state)
                  .filter((t) => category === "הכול" || t.category === category)
                  .slice(0, 12)
                  .map((t) => (
                    <article className="suggestion" key={t.id}>
                      <span className="tag">הצעה · {t.category}</span>
                      <h3>{t.title}</h3>
                      <p>
                        כ־{t.workMinutes} דקות עבודה
                        {t.waitMinutes
                          ? ` ועוד ${t.waitMinutes} דקות המתנה`
                          : ""}{" "}
                        · אומדן התחלתי
                      </p>
                      <div className="button-row">
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => void act(templateAction(t.id))}
                        >
                          כן, עושים אצלנו
                        </button>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void act({ type: "template.exclude", id: t.id })
                          }
                        >
                          לא רלוונטי לבית
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
              {state.excludedTemplates.length > 0 && (
                <details>
                  <summary>הצעות שסומנו כלא רלוונטיות</summary>
                  {state.excludedTemplates.map((id) => (
                    <div className="list-row" key={id}>
                      <span>{catalog.find((t) => t.id === id)?.title}</span>
                      <button
                        onClick={() =>
                          void act({ type: "template.restore", id })
                        }
                      >
                        להחזיר להצעות
                      </button>
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
          {view === "memory" && (
            <>
              <ViewHeader view={view} />
              <p className="intro">
                אפשר לתקן ולהסיר. מידע שהתיישן מפסיק להשפיע על ההצעות.
              </p>
              <form
                className="panel stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await run([
                      {
                        type: "fact.add",
                        text: factText,
                        kind: factKind,
                        expiresAt:
                          factKind === "temporary"
                            ? new Date(factExpiry).toISOString()
                            : null,
                      },
                    ]);
                    setFactText("");
                  } catch {}
                }}
              >
                <label>
                  משהו שכדאי שאזכור
                  <input
                    required
                    maxLength={500}
                    value={factText}
                    onChange={(e) => setFactText(e.target.value)}
                    placeholder="למשל: מעדיפים קניות ביום חמישי"
                  />
                </label>
                <label>
                  לכמה זמן?
                  <select
                    value={factKind}
                    onChange={(e) =>
                      setFactKind(e.target.value as typeof factKind)
                    }
                  >
                    <option value="stable">עד שאעדכן</option>
                    <option value="temporary">מידע זמני</option>
                  </select>
                </label>
                {factKind === "temporary" && (
                  <label>
                    נכון עד
                    <input
                      required
                      type="datetime-local"
                      value={factExpiry}
                      onChange={(e) => setFactExpiry(e.target.value)}
                    />
                  </label>
                )}
                <button className="secondary" disabled={busy}>
                  שמירה בזיכרון
                </button>
              </form>
              <div className="task-list">
                {state.facts.map((f) => (
                  <article className="memory-card" key={f.id}>
                    <div>
                      <span className="tag">
                        {f.kind === "inference"
                          ? "השערה"
                          : f.kind === "temporary"
                            ? "מידע זמני"
                            : "מידע שנמסר"}
                        {f.expiresAt && new Date(f.expiresAt) <= clock
                          ? " · התיישן"
                          : ""}
                      </span>
                      <p>{f.text}</p>
                      {f.expiresAt && (
                        <small>
                          תוקף:{" "}
                          {formatTime(f.expiresAt, state.profile.timezone)}
                        </small>
                      )}
                    </div>
                    <button
                      className="icon-button"
                      aria-label={"הסרת " + f.text}
                      onClick={() =>
                        void act({ type: "fact.remove", id: f.id })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </article>
                ))}
              </div>
              {!state.facts.length && (
                <Empty text="עדיין אין פרטים שמורים מעבר לפרופיל הבית." />
              )}
              <h2>מחזורי קנייה</h2>
              {consumptionInsights(state, clock).length ? (
                consumptionInsights(state, clock).map((i) => (
                  <article className="panel" key={i.title}>
                    <strong>{i.title}</strong>
                    <p>
                      הרכישות חוזרות בערך כל {i.days} ימים, לפי {i.samples}{" "}
                      רכישות. אולי כדאי לבדוק מלאי סביב{" "}
                      {formatTime(i.expected, state.profile.timezone)}.
                    </p>
                    <small>זו תחזית קנייה, לא ידיעה שהמוצר נגמר.</small>
                  </article>
                ))
              ) : (
                <p className="muted">
                  לאחר כמה רכישות נוכל להציע מתי לבדוק מלאי. לא נסיק שהמוצר נגמר
                  רק כי נקנה חדש.
                </p>
              )}
              <h2>מה מתחיל להסתמן</h2>
              {learning(state).length ? (
                learning(state).map((l, i) => (
                  <article className="panel" key={i}>
                    <strong>{l.title}</strong>
                    <p>
                      אולי מתאים מחזור של כ־{l.days} ימים, לפי {l.samples}{" "}
                      ביצועים. זו הצעה, והשגרה לא שונתה.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        const t = state.tasks.find(
                          (t) =>
                            (l.templateId
                              ? t.templateId === l.templateId
                              : t.title === l.title) && t.status === "open",
                        );
                        if (t) setEditor(t);
                        else
                          h.setNotice("אפשר להגדיר חזרה ביצירת המשימה הבאה.");
                      }}
                    >
                      לבחון התאמת חזרה
                    </button>
                  </article>
                ))
              ) : (
                <p className="muted">
                  נלמד רק אחרי כמה ביצועים. יום יוצא דופן לא ישנה את השגרה.
                </p>
              )}
            </>
          )}
          {view === "reminders" && (
            <>
              <ViewHeader view={view} />
              <p className="intro">
                {mode === "local"
                  ? "התזכורות בהדגמה נשמרות במכשיר בלבד. אין שליחת התראות ברקע."
                  : pushEnabled
                    ? "המכשיר רשום להתראות. מסירה תלויה בחיבור ובשעות השקט."
                    : "התזכורות נשמרות ברשימה. כדי לקבל התראה צריך להפעיל התראות במכשיר."}
              </p>
              {mode === "cloud" && !pushEnabled && (
                <button
                  className="secondary"
                  disabled={pushBusy || !pushReady}
                  onClick={() => void enablePush()}
                >
                  {pushReady
                    ? "הפעלת התראות במכשיר"
                    : "שליחת התראות עדיין לא מחוברת"}
                </button>
              )}
              <form
                className="panel stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await run([
                      {
                        type: "reminder.add",
                        title: reminderTitle,
                        dueAt: new Date(reminderDue).toISOString(),
                        taskId: null,
                      },
                    ]);
                    setReminderTitle("");
                    setReminderDue("");
                  } catch {}
                }}
              >
                <label>
                  מה להזכיר?
                  <input
                    required
                    maxLength={200}
                    value={reminderTitle}
                    onChange={(e) => setReminderTitle(e.target.value)}
                  />
                </label>
                <label>
                  מתי? לפי השעה במכשיר
                  <input
                    type="datetime-local"
                    required
                    value={reminderDue}
                    onChange={(e) => setReminderDue(e.target.value)}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  שמירת תזכורת
                </button>
              </form>
              {state.reminders.map((r) => (
                <article className="list-row panel" key={r.id}>
                  <div>
                    <strong>{r.title}</strong>
                    <p>
                      {formatTime(r.dueAt, state.profile.timezone)} ·{" "}
                      {
                        {
                          pending: "ממתינה",
                          sent: "נשלחה לשירות ההתראות",
                          failed: "השליחה לא הצליחה",
                          cancelled: "בוטלה",
                        }[r.status]
                      }
                    </p>
                  </div>
                  {r.status === "pending" && (
                    <button
                      onClick={() =>
                        void act({ type: "reminder.cancel", id: r.id })
                      }
                    >
                      ביטול
                    </button>
                  )}
                </article>
              ))}
            </>
          )}
          {view === "history" && (
            <>
              <ViewHeader view={view} />
              <p className="intro">
                הביצועים נשמרים כאן. אין צורך לזכור לדווח על הכול.
              </p>
              <div className="task-list">
                {state.tasks
                  .filter((t) => ["done", "cancelled"].includes(t.status))
                  .slice()
                  .reverse()
                  .map((t) => (
                    <TaskCard
                      state={state}
                      busy={busy}
                      clock={clock}
                      detailed={detailed}
                      onEdit={setEditor}
                      onChat={onTaskChat}
                      onComplete={(t) => {
                        setCompletion(t);
                        setWorkActual("");
                      }}
                      onAction={act}
                      key={t.id}
                      task={t}
                    />
                  ))}
              </div>
              {!completed.length &&
                !state.tasks.some((t) => t.status === "cancelled") && (
                  <Empty text="כאן יופיעו משימות שהושלמו או בוטלו." />
                )}
            </>
          )}
          {view === "settings" && (
            <>
              <ViewHeader view={view} />
              <section className="panel">
                <ProfileForm
                  profile={state.profile}
                  onSave={async (a) => {
                    await run([a], true);
                  }}
                />
              </section>
              <div className="settings-links">
                <button onClick={() => navigate("memory")}>
                  <BookOpen size={20} />
                  המידע שנשמר על הבית
                  <ChevronLeft size={18} />
                </button>
                <button onClick={() => navigate("kit")}>
                  <Leaf size={20} />
                  הצעות והרגלים
                  <ChevronLeft size={18} />
                </button>
                <button onClick={() => navigate("history")}>
                  <CheckCheck size={20} />
                  היסטוריית משימות
                  <ChevronLeft size={18} />
                </button>
                <button onClick={exportData}>
                  <Download size={20} />
                  הורדת גיבוי אישי
                </button>
                {mode === "cloud" && (
                  <button
                    disabled={pushBusy}
                    onClick={() =>
                      void (pushEnabled ? disablePush() : enablePush())
                    }
                  >
                    <Bell size={20} />
                    {pushEnabled
                      ? "כיבוי התראות במכשיר"
                      : "הפעלת התראות במכשיר"}
                  </button>
                )}
                <button onClick={() => setConfirm([{ type: "history.clear" }])}>
                  <Trash2 size={20} />
                  מחיקת השיחות והיסטוריית הפעולות
                </button>
                <button onClick={() => void h.signOut()}>
                  <LogOut size={20} />
                  {mode === "local" ? "יציאה מההדגמה" : "יציאה מהחשבון"}
                </button>
              </div>
              <p className="muted">
                הקלטות קול נשלחות לתמלול ולא נשמרות באפליקציה. ההיסטוריה מוגבלת
                ל־200 הודעות אחרונות. גיבוי עשוי לכלול מידע אישי — שמרו אותו
                אצלכם.
              </p>
            </>
          )}
        </main>
        {h.notice && (
          <div className="save-notice" role="status">
            <Check size={16} />
            <span>{h.notice}</span>
            {h.undo && (
              <button disabled={busy} onClick={() => void h.restore()}>
                <Undo2 size={15} />
                ביטול
              </button>
            )}
            <button aria-label="סגירת הודעה" onClick={() => h.setNotice("")}>
              ×
            </button>
          </div>
        )}
        {(view === "home" || view === "chat") && (
          <div className="composer-wrap">
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                if (view === "home") {
                  setView("chat");
                  return;
                }
                void send();
              }}
            >
              <VoiceButton
                enabled={
                  mode === "cloud" &&
                  state.profile.aiConsent &&
                  !thinking &&
                  !busy
                }
                onText={(text) => {
                  setDraft((prev) => (prev ? prev + " " + text : text));
                  setView("chat");
                  draftBox.current?.focus();
                }}
                onError={h.setError}
              />
              <textarea
                ref={draftBox}
                aria-label="הודעה לסוכן"
                rows={1}
                maxLength={6000}
                placeholder="כתבו לי מה קורה…"
                value={draft}
                onFocus={() => {
                  if (view === "home") setView("chat");
                }}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    if (view === "home") setView("chat");
                    else void send();
                  }
                }}
              />
              <button
                className="send"
                aria-label="שליחת הודעה"
                disabled={!draft.trim() || thinking || busy || !!proposal}
              >
                <ArrowUp size={21} />
              </button>
            </form>
            <small>
              {view === "chat"
                ? "אפשר לערוך תמלול לפני השליחה · Shift + Enter לשורה חדשה"
                : "אפשר לכתוב, לדבר או פשוט לפרוק מהראש"}
            </small>
          </div>
        )}
        <nav className="mobile-nav" aria-label="ניווט בתחתית">
          {(
            [
              ["home", Home, "בית"],
              ["chat", MessageCircle, "שיחה"],
              ["tasks", CheckCheck, "משימות"],
              ["shopping", ShoppingBasket, "קניות"],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              className={view === v ? "selected" : ""}
              onClick={() => navigate(v)}
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      {editor && (
        <TaskEditor
          task={editor === "new" ? undefined : editor}
          state={state}
          onSave={async (a) => {
            await run([a]);
          }}
          onClose={() => setEditor(null)}
        />
      )}{" "}
      {completion && (
        <Dialog title="סיימת עם המשימה" onClose={() => setCompletion(null)}>
          <p>{completion.title}</p>
          <label>
            כמה דקות עבודה בפועל? אפשר לדלג
            <input
              type="number"
              min={1}
              max={1440}
              value={workActual}
              onChange={(e) => setWorkActual(e.target.value)}
              placeholder="בלי זמן ההמתנה וההפסקות"
            />
          </label>
          <div className="button-row">
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                try {
                  await run([
                    {
                      type: "task.status",
                      id: completion.id,
                      status: "done",
                      ...(workActual ? { actualWorkMinutes: +workActual } : {}),
                    },
                  ]);
                  setCompletion(null);
                } catch {}
              }}
            >
              סימון כבוצע
            </button>
            <button className="secondary" onClick={() => setCompletion(null)}>
              חזרה
            </button>
          </div>
        </Dialog>
      )}
      {confirm && (
        <Dialog title="לאשר את השינוי?" onClose={() => setConfirm(null)}>
          <ul>
            {confirm.map((a, i) => (
              <li key={i}>
                {describe(a)}
                {"id" in a && state.tasks.find((t) => t.id === a.id)
                  ? ` — ${state.tasks.find((t) => t.id === a.id)?.title}`
                  : ""}
              </li>
            ))}
          </ul>
          <p>השינוי יבוצע רק אחרי האישור שלך.</p>
          <div className="button-row">
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                try {
                  await run(confirm, true);
                  setConfirm(null);
                } catch {}
              }}
            >
              אישור
            </button>
            <button className="secondary" onClick={() => setConfirm(null)}>
              חזרה
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
