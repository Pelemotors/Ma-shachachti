"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import { formatUpcomingWhen } from "@/lib/upcoming-reminders";
import type { UpcomingReminder } from "@/lib/upcoming-reminders";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";

const PREVIEW = 6;

export function UpcomingBell() {
  const push = usePushNotifications();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UpcomingReminder[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await authFetch("/api/reminders/upcoming").catch(() => null);
    if (!response?.ok) {
      setError("לא הצלחנו לטעון את התזכורות.");
      setLoading(false);
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (Array.isArray(body.upcoming)) setItems(body.upcoming);
    else setError("לא הצלחנו לטעון את התזכורות.");
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("button")?.focus());
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const visible = expanded ? items : items.slice(0, PREVIEW);

  return (
    <div className="bell-wrap">
      <button
        ref={buttonRef}
        className="icon-button bell-button"
        type="button"
        aria-label="התראות בדרך"
        aria-expanded={open}
        aria-controls="upcoming-panel"
        onClick={() => {
          setOpen((value) => !value);
          void refresh();
        }}
      >
        <span aria-hidden="true">🔔</span>
        {items.length ? <span className="bell-badge">{items.length}</span> : null}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id="upcoming-panel"
          className="bell-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="upcoming-title"
        >
          <div className="bell-panel-header">
            <strong id="upcoming-title">התראות בדרך</strong>
            <button
              className="icon-button"
              type="button"
              aria-label="סגירת ההתראות"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              ×
            </button>
          </div>
          {!push.initialized ? (
            <p className="muted">בודק את מצב התראות המכשיר…</p>
          ) : push.state !== "active" ? (
            <p className="muted">
              התראות המכשיר אינן פעילות.{" "}
              <span>אפשר לאשר אותן בהגדרות.</span>
            </p>
          ) : null}
          {loading ? <LoadingState label="טוען תזכורות…" compact /> : null}
          {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}
          <div className="bell-panel-scroll">
          {visible.map((item) => (
            <div className="bell-item" key={item.id}>
              <small>{formatUpcomingWhen(item.remind_at)}</small>
              <span>{item.title}</span>
              <small>{item.label}</small>
            </div>
          ))}
          {!items.length ? (
            !loading && !error ? <EmptyState title="אין כרגע תזכורות בדרך" /> : null
          ) : null}
          {items.length > PREVIEW && !expanded ? (
            <button
              className="text-button"
              type="button"
              onClick={() => setExpanded(true)}
            >
              הצג עוד
            </button>
          ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
