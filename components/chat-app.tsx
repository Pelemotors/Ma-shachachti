"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { authFetch, supabase } from "@/lib/supabase-browser";
import { seasonForDate } from "@/lib/season";
import {
  greetingForDate,
  HOME_SURFACES,
  type ChatSurface,
} from "@/lib/home-surfaces";
import { appendTranscript } from "@/lib/audio/recorder-helpers";
import { VoiceRecorder } from "@/components/voice-recorder";
import { SettingsPanel } from "@/components/settings-panel";
import {
  clearActiveChatSession,
  readActiveChatSession,
  storedSessionNeedsFallback,
  writeActiveChatSession,
} from "@/lib/active-chat-session";
import { chatHistoryUrl, isSessionId } from "@/lib/chat-sessions";
import { SchedulePlanCard } from "@/components/schedule-plan-card";
import { MySchedule } from "@/components/my-schedule";
import { UpcomingBell } from "@/components/upcoming-bell";
import type { ClientPresentation, PresentedTask, TaskRow } from "@/lib/types";
import { formatTaskWhen } from "@/lib/time";
import {
  DEFAULT_REMINDER_MINUTES,
  formatTaskReminder,
  REMINDER_MINUTE_OPTIONS,
  reminderLabel,
} from "@/lib/reminders";
import { reminderPatchFromSelect, reminderSelectValue } from "@/lib/push-client";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  presentation?: ClientPresentation | null;
};

type View = "home" | "chat" | "tasks" | "schedule" | "settings";

function formatDue(task: { due_on: string | null; due_at?: string | null }) {
  return formatTaskWhen({ due_on: task.due_on, due_at: task.due_at ?? null });
}

function formatPresentedMeta(task: PresentedTask) {
  const when = formatTaskWhen(task);
  if (when) return when;
  const note = (task.notes ?? "").trim();
  if (note && note.length <= 32) return note;
  return "";
}

export function ChatApp() {
  const router = useRouter();
  const [view, setView] = useState<View>("home");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [text, setText] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [defaultReminderMinutes, setDefaultReminderMinutes] = useState(
    DEFAULT_REMINDER_MINUTES,
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!supabase) {
        if (alive) {
          setError("החיבור לענן עדיין לא הוגדר.");
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      const nextUserId = data.session.user.id;
      if (alive) setUserId(nextUserId);
      const preferred = readActiveChatSession(nextUserId);
      let response = await authFetch(chatHistoryUrl(preferred));
      if (
        preferred &&
        storedSessionNeedsFallback(response.status)
      ) {
        clearActiveChatSession(nextUserId);
        response = await authFetch("/api/chat");
      }
      if (!alive) return;
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setError(body.error ?? "לא הצלחנו לטעון את השיחה.");
      else {
        setMessages(body.messages ?? []);
        setTasks(body.tasks ?? []);
        if (typeof body.session_id === "string" && isSessionId(body.session_id)) {
          setSessionId(body.session_id);
          writeActiveChatSession(nextUserId, body.session_id);
        }
      }
      const prefs = await authFetch("/api/preferences")
        .then((item) => item.json())
        .catch(() => ({}));
      if (alive && Number.isFinite(Number(prefs.default_reminder_minutes))) {
        setDefaultReminderMinutes(Number(prefs.default_reminder_minutes));
      }
      setLoading(false);
    }
    void load();
    return () => {
      alive = false;
    };
  }, [router]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
  }, []);

  useEffect(() => {
    if (view !== "tasks" && view !== "settings") return;
    let alive = true;
    void authFetch("/api/preferences")
      .then((item) => item.json())
      .then((prefs) => {
        if (alive && Number.isFinite(Number(prefs.default_reminder_minutes))) {
          setDefaultReminderMinutes(Number(prefs.default_reminder_minutes));
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [view]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, view]);

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status === "open"),
    [tasks],
  );
  const doneTasks = useMemo(
    () => tasks.filter((task) => task.status === "done"),
    [tasks],
  );

  async function sendMessage(message: string, surface: ChatSurface | null = null) {
    if (!message || sending) return;

    setError("");
    setSending(true);
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setView("chat");

    const response = await authFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        surface,
        session_id: sessionId,
      }),
    }).catch(() => null);

    if (!response) {
      setError("לא הצלחנו להגיע לסוכן. אפשר לנסות שוב.");
      setSending(false);
      return;
    }
    if (response.status === 401) {
      router.replace("/login");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "הסוכן לא הצליח לענות כרגע.");
      setSending(false);
      return;
    }
    setMessages((current) => [
      ...current,
      {
        id: body.id ?? `assistant-${Date.now()}`,
        role: "assistant",
        content: body.reply,
        created_at: body.created_at ?? new Date().toISOString(),
        presentation: body.presentation ?? null,
      },
    ]);
    if (Array.isArray(body.tasks)) setTasks(body.tasks);
    if (typeof body.session_id === "string" && isSessionId(body.session_id)) {
      setSessionId(body.session_id);
      if (userId) writeActiveChatSession(userId, body.session_id);
    }
    setSending(false);
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const message = text.trim();
    if (!message) return;
    setText("");
    await sendMessage(message);
  }

  function openSurface(surface: (typeof HOME_SURFACES)[number]) {
    void sendMessage(surface.objective, surface.id);
  }

  async function runTaskAction(action: Record<string, unknown>) {
    setError("");
    setSavingTask(true);
    const response = await authFetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    }).catch(() => null);
    setSavingTask(false);
    if (!response) {
      setError("לא הצלחנו לעדכן את המשימה.");
      return false;
    }
    if (response.status === 401) {
      router.replace("/login");
      return false;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "לא הצלחנו לעדכן את המשימה.");
      return false;
    }
    if (Array.isArray(body.tasks)) {
      const nextTasks = body.tasks as TaskRow[];
      setTasks(nextTasks);
      setMessages((current) =>
        current.map((message) => {
          const byId = new Map(nextTasks.map((task) => [task.id, task]));
          if (message.presentation?.type === "task_list") {
            return {
              ...message,
              presentation: {
                type: "task_list",
                tasks: message.presentation.tasks.map((item) => {
                  const next = byId.get(item.id);
                  return next
                    ? {
                        id: next.id,
                        title: next.title,
                        notes: next.notes,
                        status: next.status,
                        due_on: next.due_on,
                        due_at: next.due_at,
                      }
                    : item;
                }),
              },
            };
          }
          if (message.presentation?.type === "schedule_plan") {
            return {
              ...message,
              presentation: {
                ...message.presentation,
                items: message.presentation.items.map((item) => {
                  const next = byId.get(item.task_id);
                  return next ? { ...item, title: next.title, status: next.status } : item;
                }),
              },
            };
          }
          return message;
        }),
      );
    }
    return true;
  }

  async function startNewChat() {
    setError("");
    const response = await authFetch("/api/chat/session", { method: "POST" }).catch(
      () => null,
    );
    if (!response?.ok) {
      setError("לא הצלחנו לפתוח שיחה חדשה.");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!isSessionId(body.session_id)) {
      setError("לא הצלחנו לפתוח שיחה חדשה.");
      return;
    }
    setSessionId(body.session_id);
    if (userId) writeActiveChatSession(userId, body.session_id);
    setMessages([]);
    setView("chat");
  }

  async function openPreviousSession(nextSessionId: string) {
    if (!isSessionId(nextSessionId)) return;
    setError("");
    const response = await authFetch(chatHistoryUrl(nextSessionId)).catch(
      () => null,
    );
    if (!response) {
      setError("לא הצלחנו לפתוח את השיחה.");
      return;
    }
    if (response.status === 401) {
      router.replace("/login");
      return;
    }
    if (storedSessionNeedsFallback(response.status)) {
      if (userId) clearActiveChatSession(userId);
      setError("השיחה הזו אינה זמינה יותר.");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "לא הצלחנו לפתוח את השיחה.");
      return;
    }
    setMessages(body.messages ?? []);
    if (Array.isArray(body.tasks)) setTasks(body.tasks);
    setSessionId(nextSessionId);
    if (userId) writeActiveChatSession(userId, nextSessionId);
    setView("chat");
  }

  async function clearAllTasks() {
    if (
      !window.confirm(
        "לנקות את כל המשימות?\nכל המשימות הפתוחות והמשימות שבוצעו יוסרו מהרשימה.",
      )
    ) {
      return;
    }
    const previous = tasks;
    setError("");
    setSavingTask(true);
    const response = await authFetch("/api/tasks/clear", { method: "POST" }).catch(
      () => null,
    );
    setSavingTask(false);
    if (!response?.ok) {
      setTasks(previous);
      setError("לא הצלחנו לנקות את המשימות.");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!Array.isArray(body.tasks)) {
      setTasks(previous);
      setError("לא הצלחנו לנקות את המשימות.");
      return;
    }
    setTasks(body.tasks);
  }

  async function savePlan(messageId: string, plan: Extract<ClientPresentation, { type: "schedule_plan" }>) {
    setSavingTask(true);
    setError("");
    const response = await authFetch("/api/tasks/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: plan.date,
        items: plan.items.map((item) => ({
          task_id: item.task_id,
          planned_start: item.planned_start,
          planned_end: item.planned_end,
        })),
      }),
    }).catch(() => null);
    setSavingTask(false);
    if (!response?.ok) {
      setError("לא הצלחנו לשמור את הלוז.");
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (Array.isArray(body.tasks)) setTasks(body.tasks);
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId && message.presentation?.type === "schedule_plan"
          ? {
              ...message,
              presentation: { ...message.presentation, saved: true },
            }
          : message,
      ),
    );
  }

  async function addTask(event: FormEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || savingTask) return;
    setNewTitle("");
    await runTaskAction({ type: "task.create", title });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  async function logout() {
    await supabase?.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="lean-shell" data-theme={seasonForDate()}>
        <div className="full-status">טוען את האזור האישי…</div>
      </main>
    );
  }

  return (
    <main className="lean-shell" data-theme={seasonForDate()}>
      <section className="chat-shell">
        <header className="chat-header">
          <div className="brand-mark small">מ׳</div>
          <div className="chat-header-copy">
            <strong>מה שכחתי?</strong>
            <span>
              {view === "tasks"
                ? "המשימות שלך"
                : view === "schedule"
                  ? "הלוז שלי"
                  : view === "settings"
                  ? "הגדרות"
                  : "הסוכן האישי שלך"}
            </span>
          </div>
          <UpcomingBell />
          <button
            className="icon-button settings-button"
            type="button"
            aria-label="הגדרות"
            onClick={() => setView("settings")}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.22-1.14.52-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.77 8.84a.5.5 0 0 0 .12.64L4.92 11.06c-.04.31-.06.63-.06.94s.02.63.06.94L2.89 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.64.22l2.39-.96c.49.42 1.04.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.22 1.14-.52 1.63-.94l2.39.96c.24.1.51.01.64-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
              />
            </svg>
          </button>
          <button className="logout-button" type="button" onClick={logout}>
            יציאה
          </button>
        </header>

        {view === "home" ? (
          <div className="home-panel">
            <p className="home-tagline">הבית שלך, בקצב שלך</p>
            <h1 className="home-greeting">
              {greetingForDate()}
              <span>.</span>
            </h1>
            <p className="home-prompt">מה יעזור לך עכשיו?</p>
            <div className="home-actions">
              {HOME_SURFACES.map((surface) => (
                <button
                  key={surface.id}
                  className={`home-action ${surface.primary ? "primary" : "secondary"}`}
                  type="button"
                  disabled={sending}
                  onClick={() => openSurface(surface)}
                >
                  <span className="copy">
                    <strong>{surface.title}</strong>
                    <small>{surface.subtitle}</small>
                  </span>
                </button>
              ))}
            </div>
            {error ? <div className="error-box">{error}</div> : null}
          </div>
        ) : view === "chat" ? (
          <div className="messages" aria-live="polite">
            <div className="chat-toolbar">
              <button
                className="text-button"
                type="button"
                disabled={sending}
                onClick={() => void startNewChat()}
              >
                שיחה חדשה
              </button>
            </div>
            {messages.length === 0 ? (
              <div className="empty-chat">
                <div className="brand-mark">מ׳</div>
                <h2>מה יושב לך בראש?</h2>
                <p>
                  אפשר לבקש להוסיף משימה, להזיז תאריך, או פשוט לשוחח. הסוכן שומר
                  ומעדכן במקומך.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={`message-row ${message.role}`}>
                  <div className="bubble">
                    <p className="bubble-text">{message.content}</p>
                    {message.role === "assistant" &&
                    message.presentation?.type === "task_list" ? (
                      <ul className="chat-task-list">
                        {message.presentation.tasks.map((task) => {
                          const meta = formatPresentedMeta(task);
                          const done = task.status !== "open";
                          return (
                            <li
                              key={task.id}
                              className={done ? "done" : undefined}
                            >
                              <button
                                className={`task-check${done ? " checked" : ""}`}
                                type="button"
                                aria-label={task.title}
                                disabled={savingTask}
                                onClick={() =>
                                  void runTaskAction({
                                    type: done ? "task.reopen" : "task.complete",
                                    id: task.id,
                                  })
                                }
                              />
                              <div className="task-copy">
                                <span>{task.title}</span>
                                {meta ? <small>{meta}</small> : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    {message.role === "assistant" &&
                    message.presentation?.type === "schedule_plan" ? (
                      <SchedulePlanCard
                        plan={message.presentation}
                        saving={savingTask}
                        onToggle={(id, done) =>
                          void runTaskAction({
                            type: done ? "task.reopen" : "task.complete",
                            id,
                          })
                        }
                        onSave={() =>
                          void savePlan(message.id, message.presentation as Extract<ClientPresentation, { type: "schedule_plan" }>)
                        }
                      />
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {sending ? <div className="typing">הסוכן חושב…</div> : null}
            {error ? <div className="error-box">{error}</div> : null}
            <div ref={bottomRef} />
          </div>
        ) : view === "settings" ? (
          <SettingsPanel
            currentSessionId={sessionId}
            onOpenSession={(id) => void openPreviousSession(id)}
          />
        ) : view === "schedule" ? (
          <MySchedule
            saving={savingTask}
            onToggle={(id, done) =>
              void runTaskAction({
                type: done ? "task.reopen" : "task.complete",
                id,
              })
            }
          />
        ) : (
          <div className="tasks-panel">
            <form className="task-create" onSubmit={addTask}>
              <input
                aria-label="משימה חדשה"
                placeholder="משימה חדשה…"
                maxLength={200}
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
              />
              <button
                className="send-button"
                type="submit"
                disabled={savingTask || !newTitle.trim()}
                aria-label="הוספת משימה"
              >
                +
              </button>
            </form>
            <button
              className="text-button danger-text"
              type="button"
              disabled={savingTask}
              onClick={() => void clearAllTasks()}
            >
              נקה את כל המשימות
            </button>
            {error ? <div className="error-box">{error}</div> : null}
            {openTasks.length === 0 ? (
              <p className="muted tasks-empty">
                אין משימות פתוחות. אפשר להוסיף כאן או לבקש מהסוכן.
              </p>
            ) : (
              <ul className="task-list">
                {openTasks.map((task) => (
                  <li key={task.id} className="task-row">
                    <button
                      className="task-check"
                      type="button"
                      aria-label={`סימון ${task.title} כבוצע`}
                      disabled={savingTask}
                      onClick={() =>
                        void runTaskAction({
                          type: "task.complete",
                          id: task.id,
                        })
                      }
                    />
                    <div className="task-copy">
                      <span>{task.title}</span>
                      {formatDue(task) ? (
                        <small>{formatDue(task)}</small>
                      ) : null}
                      {task.due_at ? (
                        <small>
                          🔔{" "}
                          {formatTaskReminder({
                            due_at: task.due_at,
                            reminder_enabled: task.reminder_enabled,
                            reminder_offset_minutes:
                              task.reminder_offset_minutes,
                            default_reminder_minutes: defaultReminderMinutes,
                          })}
                        </small>
                      ) : null}
                      {task.due_at ? (
                        <label className="task-reminder">
                          <span>תזכורת</span>
                          <select
                            aria-label={`תזכורת עבור ${task.title}`}
                            disabled={savingTask}
                            value={reminderSelectValue(task)}
                            onChange={(event) =>
                              void runTaskAction({
                                type: "task.update",
                                id: task.id,
                                ...reminderPatchFromSelect(event.target.value),
                              })
                            }
                          >
                            <option value="default">
                              ברירת המחדל שלי —{" "}
                              {reminderLabel(defaultReminderMinutes)}
                            </option>
                            {REMINDER_MINUTE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {reminderLabel(option)}
                              </option>
                            ))}
                            <option value="off">ללא התראה</option>
                          </select>
                        </label>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {doneTasks.length ? (
              <ul className="task-list done">
                {doneTasks.map((task) => (
                  <li key={task.id} className="task-row done">
                    <button
                      className="task-check checked"
                      type="button"
                      aria-label={`פתיחה מחדש של ${task.title}`}
                      disabled={savingTask}
                      onClick={() =>
                        void runTaskAction({ type: "task.reopen", id: task.id })
                      }
                    />
                    <div className="task-copy">
                      <span>{task.title}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        <div className="composer-wrap">
          {view === "settings" ? null : (
            <form className="composer" onSubmit={send}>
            <VoiceRecorder
              enabled={!sending}
              onText={(transcript) => {
                setText((current) => appendTranscript(current, transcript));
                setError("");
                requestAnimationFrame(() => draftRef.current?.focus());
              }}
              onError={setError}
            />
            <textarea
              ref={draftRef}
              aria-label="הודעה לסוכן"
              placeholder="אפשר פשוט לכתוב כאן…"
              rows={1}
              maxLength={8000}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <button
              className="send-button"
              type="submit"
              disabled={sending || !text.trim()}
              aria-label="שליחה"
            >
              ←
            </button>
            </form>
          )}
          <nav className="bottom-nav" aria-label="ניווט ראשי">
            <button
              className={view === "home" ? "active" : undefined}
              type="button"
              onClick={() => setView("home")}
            >
              בית
            </button>
            <button
              className={view === "chat" ? "active" : undefined}
              type="button"
              onClick={() => setView("chat")}
            >
              שיחה
            </button>
            <button
              className={view === "tasks" ? "active" : undefined}
              type="button"
              onClick={() => setView("tasks")}
            >
              משימות
            </button>
            <button
              className={view === "schedule" ? "active" : undefined}
              type="button"
              onClick={() => setView("schedule")}
            >
              הלוז שלי
            </button>
            <button disabled type="button">
              קניות
            </button>
          </nav>
        </div>
      </section>
    </main>
  );
}
