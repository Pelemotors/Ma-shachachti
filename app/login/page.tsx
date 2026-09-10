"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { seasonForDate } from "@/lib/season";
import {
  isApprovedAccount,
  pendingAccountMessage,
  signupCreatedMessage,
} from "@/lib/account-access";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadAccess() {
    const { data: sessionData } = await supabase!.auth.getUser();
    const userId = sessionData.user?.id;
    if (!userId) return null;
    const { data } = await supabase!
      .from("user_roles")
      .select("role,approved")
      .eq("user_id", userId)
      .maybeSingle();
    return data as { role: "user" | "admin"; approved: boolean } | null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!supabase) {
      setError("החיבור לענן עדיין לא הוגדר.");
      return;
    }

    setBusy(true);
    try {
      if (signup) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) {
          setError("לא הצלחנו ליצור חשבון. בדקי את הפרטים ונסי שוב.");
          return;
        }
        if (data.session) await supabase.auth.signOut();
        setMessage(signupCreatedMessage());
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError("פרטי ההתחברות לא נכונים או שהחשבון אינו זמין.");
        return;
      }
      const access = await loadAccess();
      if (!isApprovedAccount(access)) {
        await supabase.auth.signOut();
        setError(pendingAccountMessage());
        return;
      }
      router.replace("/app");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!supabase || !email.trim()) {
      setMessage("הזיני אימייל כדי לאפס סיסמה.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${location.origin}/app` },
      );
      if (resetError) {
        setError("לא הצלחנו לשלוח קישור לאיפוס סיסמה.");
        return;
      }
      setMessage("שלחנו קישור לאיפוס סיסמה לאימייל.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="lean-shell" data-theme={seasonForDate()}>
      <section className="login-wrap">
        <div className="brand-mark">מ׳</div>
        <p className="eyebrow">מה שכחתי?</p>
        <h1>{signup ? "יצירת חשבון" : "כניסה לאזור האישי"}</h1>
        <p className="muted">
          {signup
            ? "חשבון חדש ממתין לאישור מנהל לפני כניסה."
            : "הסוכן האישי שלך מחכה לך כאן."}
        </p>

        <form className="card login-card" onSubmit={submit}>
          <label className="field">
            <span>אימייל</span>
            <input
              type="email"
              dir="ltr"
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
              dir="ltr"
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={6}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <div className="error-box">{error}</div> : null}
          {message ? <div className="success-box">{message}</div> : null}
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "רגע…" : signup ? "יצירת חשבון" : "כניסה"}
          </button>
        </form>
        {!signup ? (
          <div className="login-actions">
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => void reset()}
            >
              שכחתי סיסמה
            </button>
          </div>
        ) : null}
        <div className="login-actions">
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setSignup(!signup);
              setError("");
              setMessage("");
            }}
          >
            {signup ? "כבר יש לי חשבון — כניסה" : "אין לי חשבון — הרשמה"}
          </button>
        </div>
      </section>
    </main>
  );
}
