"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import {
  DEFAULT_REMINDER_MINUTES,
  REMINDER_MINUTE_OPTIONS,
  reminderLabel,
} from "@/lib/reminders";
import { DevicePermissionsPanel } from "@/components/device-permissions-panel";
import { MemoryLearning } from "@/components/memory-learning";
import type { Season } from "@/lib/season";
import type { UserProfile } from "@/lib/user-profile";
import { LoadingState } from "@/components/ui-states";

const SEASON_LABELS: Record<Season, string> = {
  spring: "אביב",
  summer: "קיץ",
  autumn: "סתיו",
  winter: "חורף",
};

export function SettingsPanel({
  profile,
  onProfileSaved,
  onSignOut,
}: {
  profile: UserProfile;
  onProfileSaved: (profile: UserProfile) => void;
  onSignOut: () => void;
}) {
  const [name, setName] = useState(profile.display_name ?? "");
  const [addressStyle, setAddressStyle] = useState(profile.address_style);
  const [appearanceMode, setAppearanceMode] = useState(profile.appearance_mode);
  const [appearanceSeason, setAppearanceSeason] = useState<Season>(
    profile.appearance_season ?? "spring",
  );
  const [minutes, setMinutes] = useState(DEFAULT_REMINDER_MINUTES);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesLoadFailed, setPreferencesLoadFailed] = useState(false);
  const [preferencesReload, setPreferencesReload] = useState(0);

  useEffect(() => {
    setPreferencesLoading(true);
    setPreferencesLoadFailed(false);
    void authFetch("/api/preferences")
      .then((response) => response.json())
      .then((body) => {
        const value = Number(body.default_reminder_minutes);
        if (REMINDER_MINUTE_OPTIONS.includes(value as never)) setMinutes(value);
      })
      .catch(() => {
        setPreferencesLoadFailed(true);
        setError("לא הצלחנו לטעון את כל ההגדרות.");
      })
      .finally(() => setPreferencesLoading(false));
  }, [preferencesReload]);

  async function saveProfile() {
    setSaving(true);
    setError("");
    setNotice("");
    const response = await authFetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: name.trim() || null,
        address_style: addressStyle,
        appearance_mode: appearanceMode,
        appearance_season: appearanceMode === "season" ? appearanceSeason : null,
      }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    setSaving(false);
    if (!response?.ok || !body?.profile) {
      setError(body?.error ?? "לא הצלחנו לשמור את הפרופיל.");
      return;
    }
    onProfileSaved(body.profile as UserProfile);
    setNotice("הפרופיל נשמר.");
  }

  async function saveDefault(next: number) {
    const previous = minutes;
    setMinutes(next);
    setError("");
    const response = await authFetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_reminder_minutes: next }),
    }).catch(() => null);
    if (!response?.ok) {
      setMinutes(previous);
      setError("לא הצלחנו לשמור את זמן התזכורת.");
    }
  }

  return (
    <div className="settings-panel">
      <h1>הגדרות</h1>
      {preferencesLoading ? <LoadingState label="טוען הגדרות…" compact /> : null}
      {preferencesLoadFailed ? (
        <button className="text-button" type="button" onClick={() => setPreferencesReload((value) => value + 1)}>
          נסה לטעון שוב
        </button>
      ) : null}

      <section className="settings-section" aria-labelledby="profile-title">
        <h2 id="profile-title">פרופיל</h2>
        <label className="field">
          <span>שם לתצוגה</span>
          <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>צורת פנייה</span>
          <select value={addressStyle} onChange={(event) => setAddressStyle(event.target.value as UserProfile["address_style"])}>
            <option value="neutral">ניסוח ניטרלי</option>
            <option value="feminine">לשון נקבה</option>
            <option value="masculine">לשון זכר</option>
          </select>
        </label>
        <button className="settings-action" type="button" disabled={saving} onClick={() => void saveProfile()}>
          שמירת פרופיל
        </button>
      </section>

      <section className="settings-section" aria-labelledby="agent-title">
        <h2 id="agent-title">הסוכן שלי</h2>
        <p className="muted settings-hint">
          הסוכן האישי משתמש במשימות, בשיחות ובפרטים שנשמרו כדי לעזור לך. אין כאן דמות נפרדת או מנגנון נוסף.
        </p>
        <label className="field">
          <span>תזכורת ברירת מחדל</span>
          <select value={minutes} onChange={(event) => void saveDefault(Number(event.target.value))}>
            {REMINDER_MINUTE_OPTIONS.map((option) => (
              <option key={option} value={option}>{reminderLabel(option)}</option>
            ))}
          </select>
        </label>
      </section>

      <MemoryLearning />

      <DevicePermissionsPanel />

      <section className="settings-section" aria-labelledby="appearance-title">
        <h2 id="appearance-title">מראה</h2>
        <label className="field">
          <span>ערכת צבעים</span>
          <select value={appearanceMode === "auto" ? "auto" : appearanceSeason} onChange={(event) => {
            if (event.target.value === "auto") setAppearanceMode("auto");
            else {
              setAppearanceMode("season");
              setAppearanceSeason(event.target.value as Season);
            }
          }}>
            <option value="auto">לפי העונה באופן אוטומטי</option>
            {(Object.keys(SEASON_LABELS) as Season[]).map((season) => (
              <option key={season} value={season}>{SEASON_LABELS[season]}</option>
            ))}
          </select>
        </label>
        <button className="settings-action" type="button" disabled={saving} onClick={() => void saveProfile()}>
          שמירת המראה
        </button>
      </section>

      <section className="settings-section" aria-labelledby="help-title">
        <h2 id="help-title">עזרה</h2>
        <p className="muted settings-hint">
          אפשר לכתוב לסוכן בשפה חופשית. פעולות משמעותיות יוצגו לאישור לפני ביצוע.
        </p>
      </section>

      <section className="settings-section" aria-labelledby="account-title">
        <h2 id="account-title">חשבון ופרטיות</h2>
        <p className="muted settings-hint">
          שיחות וזיכרונות נשמרים בחשבון כדי לשמור על רצף. אפשר למחוק זיכרונות ידנית למעלה.
        </p>
        <button className="text-button danger-text" type="button" onClick={onSignOut}>
          יציאה מהחשבון
        </button>
      </section>

      {notice ? <div className="success-box" role="status">{notice}</div> : null}
      {error ? <div className="error-box" role="alert">{error}</div> : null}
    </div>
  );
}
