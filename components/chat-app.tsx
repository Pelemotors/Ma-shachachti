"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch, supabase } from "@/lib/supabase-browser";
import { seasonForDate } from "@/lib/season";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export function ChatApp() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

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
      else setMessages(body.messages ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      alive = false;
    };
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const message = text.trim();
    if (!message || sending) return;

    setError("");
    setText("");
    setSending(true);
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);

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
      },
    ]);
    setSending(false);
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
        <div className="full-status">טוען את השיחה…</div>
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
            <span>הסוכן האישי שלך</span>
          </div>
          <button className="logout-button" type="button" onClick={logout}>יציאה</button>
        </header>

        <nav className="placeholder-nav" aria-label="ניווט ראשוני">
          <button disabled type="button">בית</button>
          <button className="active" type="button">שיחה</button>
          <button disabled type="button">משימות</button>
          <button disabled type="button">קניות</button>
        </nav>

        <div className="messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-chat">
              <div className="brand-mark">מ׳</div>
              <h2>מה יושב לך בראש?</h2>
              <p>אפשר פשוט לכתוב. כרגע אנחנו מתחילים משיחה אחת פשוטה עם הסוכן האישי.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`message-row ${message.role}`}>
                <div className="bubble">{message.content}</div>
              </div>
            ))
          )}
          {sending ? <div className="typing">הסוכן חושב…</div> : null}
          {error ? <div className="error-box">{error}</div> : null}
          <div ref={bottomRef} />
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={send}>
            <textarea
              aria-label="הודעה לסוכן"
              placeholder="אפשר פשוט לכתוב כאן…"
              rows={1}
              maxLength={8000}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <button className="send-button" type="submit" disabled={sending || !text.trim()} aria-label="שליחה">
              ←
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
