"use client";
import { useState, useCallback, useEffect } from "react";
import { Action } from "@/lib/model";
import { authFetch } from "@/lib/supabase-browser";
import { useHousehold } from "@/lib/use-household";
import { requestNotificationPermission } from "@/hooks/use-device-permissions";
import { messageForCode } from "@/lib/errors";

type Household = ReturnType<typeof useHousehold>;

export function useReminderController(
  h: Household,
  opts: {
    run: (actions: Action[], confirmed?: boolean) => Promise<void>;
  },
) {
  const { mode } = h;
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDue, setReminderDue] = useState("");
  const [reminderUrgency, setReminderUrgency] = useState<
    "urgent" | "medium" | "low"
  >("medium");
  const [pushReady, setPushReady] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    if (mode !== "cloud") return;
    let alive = true;
    async function init() {
      try {
        if (!("serviceWorker" in navigator)) return;
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager?.getSubscription();
        const response = await authFetch("/api/push");
        const data = await response.json();
        if (alive) {
          setPushReady(response.ok && data.ready);
          setPushEnabled(!!sub);
        }
      } catch {
        if (alive) setPushReady(false);
      }
    }
    void init();
    return () => {
      alive = false;
    };
  }, [mode]);

  /** Notification permission + push subscription only — never pairs with microphone. */
  const enablePush = useCallback(async () => {
    setPushBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error(
          "במכשיר הזה ייתכן שצריך להוסיף את האפליקציה למסך הבית ולפתוח אותה משם.",
        );
      const status = await authFetch("/api/push");
      const config = await status.json();
      if (!status.ok || !config.ready)
        throw new Error("ההתראות עדיין לא מחוברות. התזכורות נשמרות ברשימה.");

      let notificationOk =
        typeof Notification !== "undefined" &&
        Notification.permission === "granted";
      if (!notificationOk) {
        if (typeof Notification === "undefined") {
          throw new Error(messageForCode("notification_unsupported"));
        }
        if (Notification.permission === "denied") {
          throw new Error(messageForCode("notification_denied"));
        }
        const result = await requestNotificationPermission();
        notificationOk = result.status === "granted";
        if (!notificationOk) {
          throw new Error(
            result.code
              ? messageForCode(result.code)
              : messageForCode("notification_denied"),
          );
        }
      }

      const reg = await navigator.serviceWorker.ready;
      const key = Uint8Array.from(
        atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      const res = await authFetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok)
        throw new Error("הרשאת ההתראות לא נשמרה בענן. אפשר לנסות שוב.");
      setPushEnabled(true);
      h.setNotice("המכשיר נרשם לקבלת התראות");
    } catch (e) {
      h.setError(e instanceof Error ? e.message : "לא הצלחנו להפעיל התראות");
    } finally {
      setPushBusy(false);
    }
  }, [h]);

  const disablePush = useCallback(async () => {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const res = await authFetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        if (!res.ok) throw new Error("הביטול לא נשמר");
        await sub.unsubscribe();
      }
      setPushEnabled(false);
      h.setNotice("התראות למכשיר הזה כובו");
    } catch {
      h.setError("לא הצלחנו לכבות התראות. אפשר לנסות שוב.");
    } finally {
      setPushBusy(false);
    }
  }, [h]);

  const addReminder = useCallback(async () => {
    try {
      await opts.run([
        {
          type: "reminder.add",
          title: reminderTitle,
          dueAt: new Date(reminderDue).toISOString(),
          taskId: null,
          urgency: reminderUrgency,
        },
      ]);
      setReminderTitle("");
      setReminderDue("");
      setReminderUrgency("medium");
    } catch {}
  }, [opts, reminderTitle, reminderDue, reminderUrgency]);

  return {
    reminderTitle,
    setReminderTitle,
    reminderDue,
    setReminderDue,
    reminderUrgency,
    setReminderUrgency,
    pushReady,
    pushBusy,
    pushEnabled,
    enablePush,
    disablePush,
    addReminder,
  };
}

export type ReminderController = ReturnType<typeof useReminderController>;
