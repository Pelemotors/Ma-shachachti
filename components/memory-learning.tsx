"use client";

import { useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import type { MemoryRow, MemorySource } from "@/lib/types";

const SOURCE_LABELS: Record<MemorySource, string> = {
  user: "נוסף על ידך",
  agent: "נלמד בשיחה",
  legacy: "יובא מהגרסה הקודמת",
};

type Retry = { label: string; run: () => void };

export function MemoryLearning() {
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<Retry | null>(null);
  const newIds = useRef(new Set<string>());

  async function request(body: Record<string, unknown>) {
    const response = await authFetch("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload.memories)) throw new Error("memory");
    return payload.memories as MemoryRow[];
  }

  useEffect(() => {
    let alive = true;
    void authFetch("/api/memories")
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(body.memories)) throw new Error("load");
        if (!alive) return;
        const rows = body.memories as MemoryRow[];
        const unseen = rows.filter((item) => item.seen_at === null).map((item) => item.id);
        newIds.current = new Set(unseen);
        setMemories(rows);
        if (unseen.length) {
          void request({ action: "mark_seen", ids: unseen }).catch(() => undefined);
        }
      })
      .catch(() => {
        if (alive) setError("לא הצלחנו לטעון את מה שהסוכן זוכר.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function mutate(
    body: Record<string, unknown>,
    optimistic: MemoryRow[],
    label: string,
  ) {
    const snapshot = memories;
    setMemories(optimistic);
    setError("");
    setRetry(null);
    try {
      setMemories(await request(body));
      setEditing(null);
      setDraft("");
    } catch {
      setMemories(snapshot);
      setError("לא הצלחנו לשמור את השינוי.");
      setRetry({ label, run: () => void mutate(body, optimistic, label) });
    }
  }

  const groups = (["agent", "user", "legacy"] as MemorySource[])
    .map((source) => ({
      source,
      items: memories.filter((item) => item.source === source),
    }))
    .filter((group) => group.items.length);

  return (
    <section className="settings-section" aria-labelledby="memory-title">
      <h2 id="memory-title">מה הסוכן למד</h2>
      <p className="muted settings-hint">
        הסוכן מחליט מה לזכור במהלך שיחה. כאן אפשר לתקן או למחוק ידנית.
      </p>
      <form
        className="memory-add"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          void mutate({ action: "create", content: draft.trim() }, memories, "נסה שוב");
        }}
      >
        <input
          aria-label="זיכרון חדש"
          placeholder="הוספת פרט ידנית…"
          maxLength={500}
          value={editing ? "" : draft}
          disabled={Boolean(editing)}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="settings-action" disabled={!draft.trim() || Boolean(editing)}>
          הוסף
        </button>
      </form>
      {loading ? <p className="muted">טוען זיכרונות…</p> : null}
      {!loading && !memories.length ? (
        <p className="muted">עדיין אין פרטים שמורים.</p>
      ) : null}
      {groups.map((group) => (
        <div className="memory-group" key={group.source}>
          <h3>{SOURCE_LABELS[group.source]}</h3>
          {group.items.map((memory) => (
            <div className="memory-item" key={memory.id}>
              {editing === memory.id ? (
                <input
                  aria-label="עריכת זיכרון"
                  maxLength={500}
                  value={draft}
                  autoFocus
                  onChange={(event) => setDraft(event.target.value)}
                />
              ) : (
                <p>
                  {memory.content}
                  {newIds.current.has(memory.id) ? <small className="new-badge">חדש</small> : null}
                </p>
              )}
              <div className="memory-actions">
                {editing === memory.id ? (
                  <>
                    <button
                      className="text-button"
                      type="button"
                      disabled={!draft.trim()}
                      onClick={() =>
                        void mutate(
                          { action: "edit", id: memory.id, content: draft.trim() },
                          memories.map((item) =>
                            item.id === memory.id
                              ? { ...item, content: draft.trim(), source: "user" }
                              : item,
                          ),
                          "נסה שוב",
                        )
                      }
                    >
                      שמירה
                    </button>
                    <button className="text-button" type="button" onClick={() => { setEditing(null); setDraft(""); }}>
                      ביטול
                    </button>
                  </>
                ) : (
                  <>
                    <button className="text-button" type="button" onClick={() => { setEditing(memory.id); setDraft(memory.content); }}>
                      עריכה
                    </button>
                    <button
                      className="text-button danger-text"
                      type="button"
                      onClick={() => {
                        if (!window.confirm("למחוק את הפרט הזה מהזיכרון?")) return;
                        void mutate(
                          { action: "delete", id: memory.id },
                          memories.filter((item) => item.id !== memory.id),
                          "נסה שוב",
                        );
                      }}
                    >
                      מחיקה
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
      {error ? (
        <div className="error-box" role="alert">
          {error}
          {retry ? <button className="retry-button" type="button" onClick={retry.run}>{retry.label}</button> : null}
        </div>
      ) : null}
    </section>
  );
}
