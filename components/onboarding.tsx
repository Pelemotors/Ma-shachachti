"use client";

import { useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import type { UserProfile } from "@/lib/user-profile";

export function Onboarding({
  profile,
  onSaved,
}: {
  profile: UserProfile;
  onSaved: (profile: UserProfile) => void;
}) {
  const [name, setName] = useState(profile.display_name ?? "");
  const [addressStyle, setAddressStyle] = useState(profile.address_style);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function finish(action: "complete" | "skip") {
    setSaving(true);
    setError("");
    const response = await authFetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        ...(action === "complete"
          ? {
              display_name: name.trim() || null,
              address_style: addressStyle,
            }
          : {}),
      }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    setSaving(false);
    if (!response?.ok || !body?.profile) {
      setError(body?.error ?? "לא הצלחנו לשמור. אפשר לנסות שוב.");
      return;
    }
    onSaved(body.profile as UserProfile);
  }

  return (
    <div className="onboarding-backdrop">
      <section className="onboarding-card card" aria-labelledby="onboarding-title">
        <div className="brand-mark">מ׳</div>
        <h1 id="onboarding-title">נעים להכיר</h1>
        <p className="muted">
          שני פרטים קטנים שיעזרו לסוכן לדבר אליך בצורה טבעית. תמיד אפשר לשנות אחר כך.
        </p>
        <label className="field">
          <span>איך לקרוא לך? (לא חובה)</span>
          <input
            value={name}
            maxLength={80}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          <span>איך לפנות אליך?</span>
          <select
            value={addressStyle}
            onChange={(event) =>
              setAddressStyle(event.target.value as UserProfile["address_style"])
            }
          >
            <option value="neutral">ניסוח ניטרלי</option>
            <option value="feminine">לשון נקבה</option>
            <option value="masculine">לשון זכר</option>
          </select>
        </label>
        {error ? <div className="error-box" role="alert">{error}</div> : null}
        <button
          className="primary-button"
          type="button"
          disabled={saving}
          onClick={() => void finish("complete")}
        >
          שמירה והמשך
        </button>
        <button
          className="text-button onboarding-skip"
          type="button"
          disabled={saving}
          onClick={() => void finish("skip")}
        >
          דילוג לעכשיו
        </button>
      </section>
    </div>
  );
}
