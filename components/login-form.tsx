"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { seasonForDate } from "@/lib/season";
import {
  isApprovedAccount,
  pendingAccountMessage,
} from "@/lib/account-access";
import { NativeAuthButtons } from "@/components/native-auth-buttons";
import { resumePathAfterAuth } from "@/lib/native/deep-links";
import {
  RESEND_COOLDOWN_MS,
  authRedirectUrl,
  forgotPasswordNeutralMessage,
  isValidEmail,
  mapAuthErrorMessage,
  signupNeedsEmailVerification,
  validateNewPassword,
  verificationEmailSentMessage,
  verificationResentMessage,
} from "@/lib/auth/email-auth";

type Mode = "login" | "signup" | "forgot";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeHref = useMemo(
    () => resumePathAfterAuth(searchParams.get("next") || "/app"),
    [searchParams],
  );
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [resendUntil, setResendUntil] = useState(0);

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

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setMessage("");
    setAwaitingVerification(false);
    setPassword("");
    setConfirmPassword("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!supabase) {
      setError("החיבור לענן עדיין לא הוגדר.");
      return;
    }
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError("כתובת המייל אינה תקינה.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          trimmed,
          { redirectTo: authRedirectUrl("/auth/reset-password") },
        );
        // Always neutral — no account enumeration.
        if (resetError) {
          const mapped = mapAuthErrorMessage(resetError);
          if (mapped?.includes("יותר מדי")) setError(mapped);
          else setMessage(forgotPasswordNeutralMessage());
        } else {
          setMessage(forgotPasswordNeutralMessage());
        }
        return;
      }

      if (mode === "signup") {
        const validation = validateNewPassword(password, confirmPassword);
        if (validation) {
          setError(validation);
          return;
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmed,
          password,
          options: {
            emailRedirectTo: authRedirectUrl("/auth/callback"),
          },
        });
        if (signUpError) {
          setError(
            mapAuthErrorMessage(signUpError) ||
              "לא הצלחנו ליצור חשבון. בדקי את הפרטים ונסי שוב.",
          );
          return;
        }
        if (signupNeedsEmailVerification(data.session, data.user)) {
          if (data.session) await supabase.auth.signOut();
          setAwaitingVerification(true);
          setMessage(verificationEmailSentMessage());
          setResendUntil(Date.now() + RESEND_COOLDOWN_MS);
          return;
        }
        if (data.session) await supabase.auth.signOut();
        setMessage(
          "החשבון נוצר. לאחר אישור מנהל אפשר יהיה להתחבר.",
        );
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });
      if (signInError) {
        const mapped = mapAuthErrorMessage(signInError);
        if (mapped?.includes("לאמת את כתובת המייל")) {
          setAwaitingVerification(true);
          setError(mapped);
          return;
        }
        setError(mapped || "פרטי ההתחברות לא נכונים או שהחשבון אינו זמין.");
        return;
      }
      const access = await loadAccess();
      if (!isApprovedAccount(access)) {
        await supabase.auth.signOut();
        setError(pendingAccountMessage());
        return;
      }
      router.replace(resumeHref);
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    if (!supabase || !email.trim()) {
      setError("הזיני אימייל כדי לשלוח שוב מייל אימות.");
      return;
    }
    if (Date.now() < resendUntil) {
      setError("נשלחו יותר מדי מיילים. נסי שוב בעוד כדקה.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: authRedirectUrl("/auth/callback"),
        },
      });
      setResendUntil(Date.now() + RESEND_COOLDOWN_MS);
      if (resendError) {
        setError(
          mapAuthErrorMessage(resendError) ||
            "לא הצלחנו לשלוח שוב את מייל האימות.",
        );
        return;
      }
      setMessage(verificationResentMessage());
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "signup"
      ? "יצירת חשבון"
      : mode === "forgot"
        ? "איפוס סיסמה"
        : "כניסה לאזור האישי";

  const subtitle =
    mode === "signup"
      ? "נשלח מייל לאימות. לאחר מכן ייתכן שיידרש אישור מנהל."
      : mode === "forgot"
        ? "נשלח קישור לאיפוס אם קיים חשבון עם הכתובת."
        : "הסוכן האישי שלך מחכה לך כאן.";

  return (
    <main className="lean-shell" data-theme={seasonForDate()}>
      <section className="login-wrap">
        <div className="brand-mark">מ׳</div>
        <p className="eyebrow">מה שכחתי?</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>

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
          {mode !== "forgot" ? (
            <label className="field">
              <span>סיסמה</span>
              <input
                type="password"
                dir="ltr"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={6}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          ) : null}
          {mode === "signup" ? (
            <label className="field">
              <span>אימות סיסמה</span>
              <input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                minLength={6}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          ) : null}
          {error ? <div className="error-box">{error}</div> : null}
          {message ? <div className="success-box">{message}</div> : null}
          <button className="primary-button" disabled={busy} type="submit">
            {busy
              ? "רגע…"
              : mode === "signup"
                ? "יצירת חשבון"
                : mode === "forgot"
                  ? "שליחת קישור"
                  : "כניסה"}
          </button>
        </form>

        {awaitingVerification || mode === "signup" ? (
          <div className="login-actions">
            <button
              className="text-button"
              type="button"
              disabled={busy || Date.now() < resendUntil}
              onClick={() => void resendVerification()}
            >
              שלח שוב מייל אימות
            </button>
          </div>
        ) : null}

        {mode === "login" ? (
          <NativeAuthButtons
            resumeHref={resumeHref}
            onError={setError}
            onBusy={setBusy}
          />
        ) : null}

        {mode === "login" ? (
          <div className="login-actions">
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => switchMode("forgot")}
            >
              שכחתי סיסמה
            </button>
          </div>
        ) : null}

        <div className="login-actions">
          {mode !== "login" ? (
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => switchMode("login")}
            >
              חזרה להתחברות
            </button>
          ) : (
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => switchMode("signup")}
            >
              אין לי חשבון — הרשמה
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
