"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { seasonForDate } from "@/lib/season";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!supabase) {
      setError("החיבור לענן עדיין לא הוגדר.");
      return;
    }

    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);

    if (signInError) {
      setError("פרטי ההתחברות לא נכונים או שהחשבון אינו זמין.");
      return;
    }
    router.replace("/app");
  }

  return (
    <main className="lean-shell" data-theme={seasonForDate()}>
      <section className="login-wrap">
        <div className="brand-mark">מ׳</div>
        <p className="eyebrow">מה שכחתי?</p>
        <h1>כניסה לאזור האישי</h1>
        <p className="muted">הסוכן האישי שלך מחכה לך כאן.</p>

        <form className="card login-card" onSubmit={submit}>
          <label className="field">
            <span>אימייל</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="field">
            <span>סיסמה</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <div className="error-box">{error}</div> : null}
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "מתחבר…" : "כניסה"}
          </button>
        </form>
      </section>
    </main>
  );
}
