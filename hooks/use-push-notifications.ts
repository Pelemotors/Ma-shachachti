"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import {
  canPromptPushPermission,
  notificationUiState,
  shouldAutoRequestPushPermission,
  urlBase64ToUint8Array,
  type PushUiState,
} from "@/lib/push-client";

async function currentPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export function queryNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushUiState>("unsupported");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const supported =
      typeof window !== "undefined" &&
      window.isSecureContext &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;
    const permission = queryNotificationPermission();
    const subscription = supported ? await currentPushSubscription() : null;
    setState(
      notificationUiState({
        supported,
        permission,
        hasSubscription: Boolean(subscription),
      }),
    );
  }, []);

  useEffect(() => {
    if (shouldAutoRequestPushPermission()) {
      void Notification.requestPermission();
    }
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").then(() => refresh());
    } else {
      void refresh();
    }
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    void authFetch("/api/push")
      .then((response) => response.json())
      .then((body) => {
        if (alive) setReady(Boolean(body.ready && body.publicKey));
      })
      .catch(() => {
        if (alive) setReady(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const enable = useCallback(async () => {
    if (!canPromptPushPermission(state) && state !== "granted") return;
    setBusy(true);
    setError("");
    try {
      const config = await authFetch("/api/push").then((response) =>
        response.json(),
      );
      if (!config.ready || !config.publicKey) {
        setError("ההתראות עדיין לא מחוברות בשרת.");
        return;
      }
      if (typeof Notification === "undefined") {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "default");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const readyWorker = await navigator.serviceWorker.ready;
      const existing = await readyWorker.pushManager.getSubscription();
      const subscription =
        existing ??
        (await readyWorker.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey),
        }));
      const payload = subscription.toJSON();
      if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
        setError("לא הצלחנו ליצור הרשאה להתראות.");
        return;
      }
      const saved = await authFetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: payload.endpoint,
          keys: {
            p256dh: payload.keys.p256dh,
            auth: payload.keys.auth,
          },
        }),
      });
      if (!saved.ok) {
        setError("לא הצלחנו לשמור את הרשאת ההתראות.");
        return;
      }
      void registration;
      await refresh();
    } catch {
      setError("הפעלת ההתראות נכשלה.");
    } finally {
      setBusy(false);
    }
  }, [refresh, state]);

  return { state, ready, busy, error, enable, refresh };
}
