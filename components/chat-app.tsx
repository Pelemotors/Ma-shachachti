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
import { greetingForDate, HOME_SURFACES } from "@/lib/home-surfaces";
import { appendTranscript } from "@/lib/audio/recorder-helpers";
import { VoiceRecorder } from "@/components/voice-recorder";
import type { ClientPresentation, PresentedTask, TaskRow } from "@/lib/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  presentation?: ClientPresentation | null;
};

type View = "home" | "chat" | "tasks";

function formatDue(due: string | null) {
  if (!due) return "";
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(`${due}T12:00:00+03:00`));
}

function formatPresentedMeta(task: PresentedTask) {
  const due = task.due_on
    ? new Intl.DateTimeFormat("he-IL", {
        day: "numeric",
        month: "long",
        timeZone: "Asia/Jerusalem",
      }).format(new Date(`${task.due_on}T12:00:00+03:00`))
    : "";
  const timeMatch = (task.notes ?? "").trim().match(/^(\d{1,2}:\d{2})/);
  const time = timeMatch?.[1] ?? "";
  if (due && time) return `${due} · ${time}`;
  if (due) return due;
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
      const response = await authFetch("/api/chat");
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
      }
      setLoading(false);
    }
    void load();
    return () => {
      alive = false;
    };
  }, [router]);

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

  async function sendMessage(message: string) {
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
      body: JSON.stringify({ message }),
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
    setSending(false);
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const message = text.trim();
    if (!message) return;
    setText("");
    await sendMessage(message);
  }

  function openSurface(objective: string) {
    void sendMessage(objective);
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
          if (message.presentation?.type !== "task_list") return message;
          const byId = new Map(nextTasks.map((task) => [task.id, task]));
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
                    }
                  : item;
              }),
            },
          };
        }),
      );
    }
    return true;
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
            <span>{view === "tasks" ? "המשימות שלך" : "הסוכן האישי שלך"}</span>
          </div>
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
                  onClick={() => openSurface(surface.objective)}
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
                                aria-label={
                                  done
                                    ? task.title
                                    : `סימון ${task.title} כבוצע`
                                }
                                disabled={savingTask || done}
                                onClick={() =>
                                  void runTaskAction({
                                    type: "task.complete",
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
                  </div>
                </div>
              ))
            )}
            {sending ? <div className="typing">הסוכן חושב…</div> : null}
            {error ? <div className="error-box">{error}</div> : null}
            <div ref={bottomRef} />
          </div>
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
                      {task.due_on ? (
                        <small>{formatDue(task.due_on)}</small>
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
            <button disabled type="button">
              קניות
            </button>
          </nav>
        </div>
      </section>
    </main>
  );
}
