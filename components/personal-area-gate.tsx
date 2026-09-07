"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { HomeApp } from "./home-app";
import { SupportReport } from "./support-report";

export function PersonalAreaGate() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    async function check() {
      if (!supabase) {
        if (alive) setReady(true);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) {
        const target = `${location.pathname}${location.search}`;
        location.replace(`/login?returnTo=${encodeURIComponent(target)}`);
        return;
      }
      setReady(true);
    }
    void check();
    const listener = supabase?.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === "SIGNED_OUT" || !session) {
        const target = `${location.pathname}${location.search}`;
        location.replace(`/login?returnTo=${encodeURIComponent(target)}`);
      }
    });
    return () => {
      alive = false;
      listener?.data.subscription.unsubscribe();
    };
  }, []);

  if (!ready)
    return (
      <main className="center" aria-busy="true">
        <div className="brand-mark">מ׳</div>
        <p>פותח את הבית שלך…</p>
      </main>
    );

  return (
    <>
      <HomeApp />
      <SupportReport />
    </>
  );
}
