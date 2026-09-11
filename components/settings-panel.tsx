"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import {
  DEFAULT_REMINDER_MINUTES,
  REMINDER_MINUTE_OPTIONS,
  reminderLabel,
} from "@/lib/reminders";
import { DevicePermissionsPanel } from "@/components/device-permissions-panel";
import { PreviousChats } from "@/components/previous-chats";

export function SettingsPanel({
  currentSessionId,
  onOpenSession,
}: {
  currentSessionId: string | null;
  onOpenSession: (sessionId: string) => void;
}) {
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

  return (
    <div className="settings-panel">
      <h1>הגדרות</h1>
      <DevicePermissionsPanel />
      <PreviousChats
        currentSessionId={currentSessionId}
        onOpenSession={onOpenSession}
      />
      <section className="settings-section">
        <h2>תזכורת ברירת מחדל</h2>
        <p className="muted">
          כמה זמן לפני בסיס הזמן לשלוח תזכורת שהפעלת?
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
          תזכורות כבויות כברירת מחדל. ההגדרה חלה רק לאחר הפעלה מפורשת במשימה.
        </p>
      </section>
      {error ? <div className="error-box">{error}</div> : null}
    </div>
  );
}
