"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import { formatUpcomingWhen } from "@/lib/upcoming-reminders";
import type { UpcomingReminder } from "@/lib/upcoming-reminders";
import { usePushNotifications } from "@/hooks/use-push-notifications";

const PREVIEW = 6;

export function UpcomingBell() {
  const push = usePushNotifications();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UpcomingReminder[]>([]);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    const response = await authFetch("/api/reminders/upcoming").catch(() => null);
    if (!response?.ok) return;
    const body = await response.json().catch(() => ({}));
    if (Array.isArray(body.upcoming)) setItems(body.upcoming);
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const visible = expanded ? items : items.slice(0, PREVIEW);

  return (
    <div className="bell-wrap">
      <button
        className="icon-button bell-button"
        type="button"
        aria-label="התראות בדרך"
        onClick={() => {
          setOpen((value) => !value);
          void refresh();
        }}
      >
        <span aria-hidden="true">🔔</span>
        {items.length ? <span className="bell-badge">{items.length}</span> : null}
      </button>
      {open ? (
        <div className="bell-panel">
          <strong>התראות בדרך</strong>
          {push.state !== "active" ? (
            <p className="muted">
              התראות המכשיר אינן פעילות.{" "}
              <span>אפשר לאשר אותן בהגדרות.</span>
            </p>
          ) : null}
          {visible.map((item) => (
            <div className="bell-item" key={item.id}>
              <small>{formatUpcomingWhen(item.remind_at)}</small>
              <span>{item.title}</span>
              <small>{item.label}</small>
            </div>
          ))}
          {!items.length ? (
            <p className="muted">אין כרגע תזכורות בדרך.</p>
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
      ) : null}
    </div>
  );
}
