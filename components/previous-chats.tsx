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

export function PreviousChats({
  currentSessionId,
  onOpenSession,
}: {
  currentSessionId: string | null;
  onOpenSession: (sessionId: string) => void;
}) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
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
  }, []);

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

  return (
    <section className="settings-section">
      <h2>שיחות קודמות</h2>
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
    </section>
  );
}
