"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch, supabase } from "@/lib/supabase-browser";

type SessionState =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "authed"; email: string | null };

export function AccountDeletionClient() {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!supabase) {
        if (alive) setSession({ status: "anon" });
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      const user = data.session?.user;
      if (user) {
        setSession({ status: "authed", email: user.email ?? null });
      } else {
        setSession({ status: "anon" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onDelete() {
    setError("");
    if (confirmText.trim() !== "DELETE") {
      setError('יש להקליד DELETE לאישור.');
      return;
    }
    setBusy(true);
    try {
      const response = await authFetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          typeof body.error === "string"
            ? body.error
            : "מחיקת החשבון נכשלה.",
        );
        return;
      }
      await supabase?.auth.signOut();
      setDone(true);
    } catch {
      setError("מחיקת החשבון נכשלה.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="legal-card" aria-live="polite">
        <h2>החשבון נמחק</h2>
        <p>
          החשבון והמידע האישי בשרת נמחקו בהתאם למדיניות הפרטיות. ייתכן שמידע
          יישאר זמנית בגיבויים תפעוליים עד לסבב הגיבוי הבא.
        </p>
        <Link className="settings-action" href="/">
          חזרה לאתר
        </Link>
      </section>
    );
  }

  return (
    <section className="legal-card">
      <h2>מחיקה עצמית (מומלץ)</h2>
      <p>
        אפשר למחוק את החשבון ישירות מהדף הזה אחרי התחברות — בלי להתקין מחדש
        את האפליקציה.
      </p>

      {session.status === "loading" ? (
        <p className="muted">בודקים אם אתם מחוברים…</p>
      ) : null}

      {session.status === "anon" ? (
        <div className="legal-actions">
          <p>
            אינכם מחוברים כרגע. התחברו כדי לאשר מחיקה מאובטחת של החשבון שלכם.
          </p>
          <Link
            className="settings-action"
            href="/login?next=/account-deletion"
          >
            התחברות כדי למחוק חשבון
          </Link>
        </div>
      ) : null}

      {session.status === "authed" ? (
        <div className="legal-actions">
          <p className="muted">
            מחוברים כ־{session.email ?? "משתמש מאומת"}. פעולה זו אינה ניתנת
            לביטול.
          </p>
          <label className="field">
            <span>הקלידו DELETE לאישור</span>
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button
            className="settings-action danger-text"
            type="button"
            disabled={busy}
            onClick={() => void onDelete()}
          >
            {busy ? "מוחקים…" : "מחק את החשבון שלי לצמיתות"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="error-box" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
