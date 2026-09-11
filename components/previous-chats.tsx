"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import {
  SESSION_LIST_PAGE,
  type ChatSessionSummary,
} from "@/lib/chat-sessions";
import { formatSessionWhen } from "@/lib/time";

function messageCountLabel(count: number) {
  if (count <= 0) return "";
  if (count === 1) return "הודעה אחת";
  return `${count} הודעות`;
}

export function ChatHistoryDrawer({
  open,
  currentSessionId,
  onOpenSession,
  onNewSession,
  onClose,
}: {
  open: boolean;
  currentSessionId: string | null;
  onOpenSession: (sessionId: string) => void;
  onNewSession: () => void;
  onClose: () => void;
}) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError("");
    void authFetch(`/api/chat/sessions?limit=${SESSION_LIST_PAGE}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!alive) return;
        if (!response.ok) {
          setError("לא הצלחנו לטעון את השיחות הקודמות.");
          return;
        }
        setSessions(Array.isArray(body.sessions) ? body.sessions : []);
        setHasMore(Boolean(body.has_more));
      })
      .catch(() => {
        if (alive) setError("לא הצלחנו לטעון את השיחות הקודמות.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  async function loadMore() {
    setLoadingMore(true);
    const response = await authFetch(
      `/api/chat/sessions?limit=${SESSION_LIST_PAGE}&offset=${sessions.length}`,
    ).catch(() => null);
    setLoadingMore(false);
    if (!response?.ok) {
      setError("לא הצלחנו לטעון עוד שיחות.");
      return;
    }
    const body = await response.json().catch(() => ({}));
    const next = Array.isArray(body.sessions) ? body.sessions : [];
    setSessions((current) => [...current, ...next]);
    setHasMore(Boolean(body.has_more));
  }

  const others = sessions.filter((session) => session.id !== currentSessionId);

  if (!open) return null;

  return (
    <div className="history-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="history-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="history-header">
          <h2 id="history-title">השיחות שלי</h2>
          <button className="icon-button" type="button" aria-label="סגירת היסטוריית השיחות" autoFocus onClick={onClose}>
            ×
          </button>
        </header>
        <button
          className="settings-action history-new"
          type="button"
          onClick={() => {
            onNewSession();
            onClose();
          }}
        >
          שיחה חדשה
        </button>
      {loading ? <p className="muted">טוען שיחות…</p> : null}
      {!loading && sessions.length === 0 ? (
        <p className="muted">אין עדיין שיחות קודמות.</p>
      ) : null}
      <div className="previous-chats">
        {sessions.map((session) => {
          const current = session.id === currentSessionId;
          const count = messageCountLabel(session.message_count);
          return (
            <button
              key={session.id}
              type="button"
              className={`previous-chat${current ? " current" : ""}`}
              aria-current={current ? "true" : undefined}
              disabled={openingId === session.id}
              onClick={() => {
                setOpeningId(session.id);
                onOpenSession(session.id);
                onClose();
              }}
            >
              <span className="previous-chat-title">
                <span>{session.preview}</span>
                {current ? <small className="current-badge">נוכחית</small> : null}
              </span>
              <span className="previous-chat-meta">
                {formatSessionWhen(session.last_message_at)}
                {count ? ` · ${count}` : ""}
              </span>
            </button>
          );
        })}
      </div>
      {!loading && sessions.length > 0 && others.length === 0 ? (
        <p className="muted">אין עדיין שיחות קודמות.</p>
      ) : null}
      {hasMore ? (
        <button
          className="text-button previous-chats-more"
          type="button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          הצג עוד
        </button>
      ) : null}
      {error ? <div className="error-box">{error}</div> : null}
      </aside>
    </div>
  );
}
