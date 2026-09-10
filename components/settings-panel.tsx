"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import {
  DEFAULT_REMINDER_MINUTES,
  REMINDER_MINUTE_OPTIONS,
  reminderLabel,
} from "@/lib/reminders";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import type { PushUiState } from "@/lib/push-client";

function statusCopy(state: PushUiState) {
  if (state === "unsupported") {
    return "התראות Push אינן נתמכות במכשיר הזה";
  }
  if (state === "denied") {
    return "ההתראות חסומות בהגדרות הדפדפן/המכשיר";
  }
  if (state === "granted") {
    return "התראות פעילות במכשיר הזה";
  }
  if (state === "granted-unsubscribed") {
    return "הרשאה קיימת, ההתראות עדיין לא הופעלו";
  }
  return "התראות עדיין לא אושרו";
}

function actionLabel(state: PushUiState) {
  if (state === "granted-unsubscribed") return "הפעל התראות";
  return "אפשר התראות";
}

export function SettingsPanel() {
  const push = usePushNotifications();
  const [minutes, setMinutes] = useState(DEFAULT_REMINDER_MINUTES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void authFetch("/api/preferences")
      .then((response) => response.json())
      .then((body) => {
        if (!alive) return;
        const value = Number(body.default_reminder_minutes);
        setMinutes(
          REMINDER_MINUTE_OPTIONS.includes(
            value as (typeof REMINDER_MINUTE_OPTIONS)[number],
          )
            ? (value as (typeof REMINDER_MINUTE_OPTIONS)[number])
            : DEFAULT_REMINDER_MINUTES,
        );
      })
      .catch(() => {
        if (alive) setError("לא הצלחנו לטעון את ההגדרות.");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function saveDefault(next: number) {
    setMinutes(next as (typeof REMINDER_MINUTE_OPTIONS)[number]);
    setSaving(true);
    setError("");
    const response = await authFetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_reminder_minutes: next }),
    }).catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      setError("לא הצלחנו לשמור את זמן התזכורת.");
    }
  }

  const showButton =
    push.state === "default" || push.state === "granted-unsubscribed";

  return (
    <div className="settings-panel">
      <h1>הגדרות</h1>
      <section className="settings-section">
        <h2>התראות ותזכורות</h2>
        <p className={`push-status ${push.state}`}>
          <span aria-hidden="true">
            {push.state === "granted" ? "🔔" : "🔕"}
          </span>
          {statusCopy(push.state)}
        </p>
        {showButton ? (
          <button
            className="settings-action"
            type="button"
            disabled={push.busy}
            onClick={() => void push.enable()}
          >
            {actionLabel(push.state)}
          </button>
        ) : null}
        {push.error ? <p className="error-box">{push.error}</p> : null}
      </section>
      <section className="settings-section">
        <h2>תזכורת ברירת מחדל</h2>
        <p className="muted">
          כמה זמן לפני משימה עם שעה לשלוח לך התראה?
        </p>
        <label className="settings-field">
          <span className="sr-only">תזכורת ברירת מחדל</span>
          <select
            value={minutes}
            disabled={saving}
            onChange={(event) => void saveDefault(Number(event.target.value))}
          >
            {REMINDER_MINUTE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {reminderLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <p className="muted settings-hint">
          ההגדרה חלה על משימות עם תאריך ושעה. אפשר לשנות את התזכורת גם במשימה
          מסוימת.
        </p>
      </section>
      {error ? <div className="error-box">{error}</div> : null}
    </div>
  );
}
