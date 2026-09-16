"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { seasonForDate } from "@/lib/season";
import {
  mapAuthErrorMessage,
  passwordUpdatedMessage,
  validateNewPassword,
} from "@/lib/auth/email-auth";

function ResetPasswordInner() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("בודקים את קישור האיפוס…");

  useEffect(() => {
    let alive = true;
    async function boot() {
      if (!supabase) {
        setError("החיבור לענן עדיין לא הוגדר.");
        setMessage("");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const errorDescription =
        params.get("error_description") || params.get("error");
      if (errorDescription) {
        setError(
          mapAuthErrorMessage({ message: errorDescription }) ||
            "הקישור לאיפוס אינו תקין או שפג תוקפו.",
        );
        setMessage("");
        return;
      }

      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (!alive) return;
          setError(
            mapAuthErrorMessage(exchangeError) ||
              "הקישור לאיפוס אינו תקין או שפג תוקפו.",
          );
          setMessage("");
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) {
        setError("חסר סשן איפוס. בקשי קישור חדש דרך «שכחתי סיסמה».");
        setMessage("");
        return;
      }
      setReady(true);
      setMessage("בחרי סיסמה חדשה לחשבון.");
    }
    void boot();
    return () => {
      alive = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!supabase) {
      setError("החיבור לענן עדיין לא הוגדר.");
      return;
    }
    const validation = validateNewPassword(password, confirm);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(
          mapAuthErrorMessage(updateError) ||
            "לא הצלחנו לעדכן את הסיסמה. נסי שוב.",
        );
        return;
      }
      await supabase.auth.signOut();
      setMessage(passwordUpdatedMessage());
      setReady(false);
      setTimeout(() => router.replace("/login"), 1200);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="lean-shell" data-theme={seasonForDate()}>
      <section className="login-wrap">
        <div className="brand-mark">מ׳</div>
        <p className="eyebrow">מה שכחתי?</p>
        <h1>סיסמה חדשה</h1>
        {message ? <p className="muted">{message}</p> : null}
        {error ? <div className="error-box">{error}</div> : null}
        {ready ? (
          <form className="card login-card" onSubmit={submit}>
            <label className="field">
              <span>סיסמה חדשה</span>
              <input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                minLength={6}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="field">
              <span>אימות סיסמה</span>
              <input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                minLength={6}
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? "שומרים…" : "עדכון סיסמה"}
            </button>
          </form>
        ) : null}
        {!ready ? (
          <div className="login-actions">
            <a className="text-button" href="/login">
              חזרה להתחברות
            </a>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="lean-shell">
          <p className="muted">טוען…</p>
        </main>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
