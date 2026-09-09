"use client";

import { useEffect, useState } from "react";
import { authFetch, supabase } from "@/lib/supabase-browser";
import { HomeApp } from "./home-app";
import { SeasonalPublicShell } from "./seasonal-public-shell";

type GateState = "loading" | "ready" | "pending" | "error";

export function PersonalAreaGate() {
  const [state, setState] = useState<GateState>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    async function check() {
      // No cloud config → HomeApp choose/local demo (README: device-local demonstration).
      if (!supabase) {
        if (alive) setState("ready");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) {
        const target = `${location.pathname}${location.search}`;
        location.replace(`/login?returnTo=${encodeURIComponent(target)}`);
        return;
      }
      const response = await authFetch("/api/state", { cache: "no-store" });
      if (!alive) return;
      if (response.status === 403) {
        setState("pending");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setMessage(body?.error ?? "לא הצלחנו לפתוח את החשבון כרגע.");
        setState("error");
        return;
      }
      setState("ready");
    }
    void check();
    const listener = supabase?.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === "SIGNED_OUT" || !session) {
        const target = `${location.pathname}${location.search}`;
        location.replace(`/login?returnTo=${encodeURIComponent(target)}`);
      }
      if (event === "TOKEN_REFRESHED") void check();
    });
    return () => {
      alive = false;
      listener?.data.subscription.unsubscribe();
    };
  }, []);

  if (state === "loading")
    return (
      <SeasonalPublicShell>
        <main className="center" aria-busy="true">
          <div className="brand-mark">מ׳</div>
          <p>פותח את הבית שלך…</p>
        </main>
      </SeasonalPublicShell>
    );

  if (state === "pending")
    return (
      <SeasonalPublicShell>
        <main className="welcome">
          <div className="brand-mark">מ׳</div>
          <p className="eyebrow">מה שכחתי?</p>
          <h1>החשבון עדיין ממתין לאישור.</h1>
          <p>המידע האישי לא נטען עד שהגישה מאושרת.</p>
          <button
            className="secondary"
            onClick={() => void supabase?.auth.signOut()}
          >
            יציאה
          </button>
        </main>
      </SeasonalPublicShell>
    );

  if (state === "error")
    return (
      <SeasonalPublicShell>
        <main className="welcome">
          <div className="brand-mark">מ׳</div>
          <h1>לא הצלחנו לפתוח את החשבון.</h1>
          <p role="alert" className="error">
            {message}
          </p>
          <button className="secondary" onClick={() => location.reload()}>
            ניסיון נוסף
          </button>
        </main>
      </SeasonalPublicShell>
    );

  return <HomeApp />;
}
