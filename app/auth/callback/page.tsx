"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { seasonForDate } from "@/lib/season";
import {
  isApprovedAccount,
  pendingAccountMessage,
} from "@/lib/account-access";
import {
  mapAuthErrorMessage,
} from "@/lib/auth/email-auth";
import { resumePathAfterAuth } from "@/lib/native/deep-links";

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("מאמתים את החשבון…");

  const nextHref = useMemo(
    () => resumePathAfterAuth(searchParams.get("next") || "/app"),
    [searchParams],
  );

  useEffect(() => {
    let alive = true;
    async function run() {
      if (!supabase) {
        setError("החיבור לענן עדיין לא הוגדר.");
        return;
      }

      const code = searchParams.get("code");
      const type = searchParams.get("type");
      const errorDescription =
        searchParams.get("error_description") || searchParams.get("error");

      if (errorDescription) {
        setError(
          mapAuthErrorMessage({ message: errorDescription }) ||
            "הקישור לאימות אינו תקין או שפג תוקפו.",
        );
        setMessage("");
        return;
      }

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          code,
        );
        if (exchangeError) {
          if (!alive) return;
          setError(
            mapAuthErrorMessage(exchangeError) ||
              "לא הצלחנו להשלים את האימות מהקישור.",
          );
          setMessage("");
          return;
        }
      } else {
        // Hash-based links: supabase-js picks up the session when detectSessionInUrl is on.
        await new Promise((r) => setTimeout(r, 50));
      }

      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) {
        setError("הקישור אינו תקין, פג תוקף, או שכבר נוצל.");
        setMessage("");
        return;
      }

      if (type === "recovery" || data.session) {
        // Recovery links should land on reset-password; confirmation continues.
        const hashType =
          typeof window !== "undefined" &&
          /type=recovery/.test(window.location.hash)
            ? "recovery"
            : type;
        if (hashType === "recovery") {
          router.replace("/auth/reset-password");
          return;
        }
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setError("לא הצלחנו לזהות את המשתמש אחרי האימות.");
        setMessage("");
        return;
      }

      const { data: access } = await supabase
        .from("user_roles")
        .select("role,approved")
        .eq("user_id", userId)
        .maybeSingle();

      if (!isApprovedAccount(access as { role: "user" | "admin"; approved: boolean } | null)) {
        await supabase.auth.signOut();
        setMessage("");
        setError(
          `המייל אומת בהצלחה. ${pendingAccountMessage()}`,
        );
        return;
      }

      setMessage("החשבון אומת בהצלחה. מעבירים אותך פנימה…");
      router.replace(nextHref);
    }
    void run();
    return () => {
      alive = false;
    };
  }, [nextHref, router, searchParams]);

  return (
    <main className="lean-shell" data-theme={seasonForDate()}>
      <section className="login-wrap">
        <div className="brand-mark">מ׳</div>
        <p className="eyebrow">מה שכחתי?</p>
        <h1>אימות חשבון</h1>
        {message ? <p className="muted">{message}</p> : null}
        {error ? <div className="error-box">{error}</div> : null}
        {error ? (
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

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="lean-shell">
          <p className="muted">טוען…</p>
        </main>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
