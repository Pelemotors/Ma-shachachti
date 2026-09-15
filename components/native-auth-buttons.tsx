"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { nativeCapability } from "@/lib/native";
import { isApprovedAccount, pendingAccountMessage } from "@/lib/account-access";

export function NativeAuthButtons(props: {
  resumeHref: string;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [appleBusy, setAppleBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function finishWithHashedToken(hashedToken: string) {
    if (!supabase) {
      props.onError("החיבור לענן עדיין לא הוגדר.");
      return;
    }
    const { error } = await supabase.auth.verifyOtp({
      token_hash: hashedToken,
      type: "email",
    });
    if (error) {
      props.onError("לא הצלחנו להשלים התחברות.");
      return;
    }
    const { data: sessionData } = await supabase.auth.getUser();
    const userId = sessionData.user?.id;
    if (!userId) {
      props.onError("לא הצלחנו להשלים התחברות.");
      return;
    }
    const { data } = await supabase
      .from("user_roles")
      .select("role,approved")
      .eq("user_id", userId)
      .maybeSingle();
    if (!isApprovedAccount(data as { role: "user" | "admin"; approved: boolean } | null)) {
      await supabase.auth.signOut();
      props.onError(pendingAccountMessage());
      return;
    }
    window.location.replace(props.resumeHref || "/app");
  }

  async function run(provider: "apple" | "google") {
    const native = nativeCapability();
    props.onBusy(true);
    if (provider === "apple") setAppleBusy(true);
    else setGoogleBusy(true);
    try {
      const result =
        provider === "apple"
          ? await native.authenticateWithApple()
          : await native.authenticateWithGoogle();
      if (result.status === "cancelled") return;
      if (result.status === "unavailable") {
        props.onError(result.reason);
        return;
      }
      if (result.status !== "ok") {
        props.onError(result.message || "ההתחברות נכשלה.");
        return;
      }
      const response = await fetch("/api/auth/native", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          identityToken: result.identityToken,
          nonce: result.nonce,
          fullName: result.fullName,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        props.onError(
          typeof body.error === "string" ? body.error : "ההתחברות נכשלה.",
        );
        return;
      }
      await finishWithHashedToken(String(body.hashedToken));
    } finally {
      setAppleBusy(false);
      setGoogleBusy(false);
      props.onBusy(false);
    }
  }

  return (
    <div className="login-actions" style={{ display: "grid", gap: 8 }}>
      <button
        className="secondary-button"
        type="button"
        disabled={appleBusy || googleBusy}
        onClick={() => void run("apple")}
      >
        {appleBusy ? "מתחבר…" : "המשך עם Apple"}
      </button>
      <button
        className="secondary-button"
        type="button"
        disabled={appleBusy || googleBusy}
        onClick={() => void run("google")}
      >
        {googleBusy ? "מתחבר…" : "המשך עם Google"}
      </button>
    </div>
  );
}
