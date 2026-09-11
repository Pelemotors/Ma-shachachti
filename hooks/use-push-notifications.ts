"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import {
  canPromptPushPermission,
  notificationUiState,
  urlBase64ToUint8Array,
  type PushUiState,
} from "@/lib/push-client";
import { ensurePushServiceWorker } from "@/lib/push-service-worker";

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
  const [initialized, setInitialized] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const supported =
        typeof window !== "undefined" &&
        window.isSecureContext &&
        "Notification" in window &&
        "serviceWorker" in navigator &&
        "PushManager" in window;
      const permission = queryNotificationPermission();
      const subscription = supported ? await currentPushSubscription() : null;
      const config = await authFetch("/api/push")
        .then((response) => response.json())
        .catch(() => ({}));
      const deliveryReady = Boolean(config.deliveryReady && config.publicKey);
      setReady(deliveryReady);
      setState(
        notificationUiState({
          supported,
          permission,
          hasSubscription: Boolean(subscription),
          deliveryReady,
        }),
      );
    } finally {
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void ensurePushServiceWorker().then(() => refresh()).catch(() => refresh());
    } else {
      void refresh();
    }
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!canPromptPushPermission(state)) return;
    setBusy(true);
    setError("");
    setMessage("");
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
        setState("permission-denied");
        return;
      }
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        setState(
          permission === "denied"
            ? "permission-denied"
            : "permission-required",
        );
        return;
      }
      const registration = await ensurePushServiceWorker();
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
      setMessage("ההתראות הופעלו במכשיר.");
    } catch {
      setError("הפעלת ההתראות נכשלה.");
    } finally {
      setBusy(false);
    }
  }, [refresh, state]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const subscription = await currentPushSubscription();
      if (!subscription) {
        await refresh();
        return;
      }
      const removed = await authFetch("/api/push", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      if (!removed.ok) throw new Error("server_delete_failed");
      await subscription.unsubscribe();
      await refresh();
      setMessage("ההתראות כובו במכשיר הזה.");
    } catch {
      setError("כיבוי ההתראות לא הושלם.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const test = useCallback(async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await authFetch("/api/push/test", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "failed");
      setMessage("התראת בדיקה נשלחה למכשיר.");
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message !== "failed"
          ? cause.message
          : "שליחת התראת הבדיקה נכשלה.",
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return {
    state,
    initialized,
    ready,
    busy,
    error,
    message,
    enable,
    disable,
    test,
    refresh,
  };
}
