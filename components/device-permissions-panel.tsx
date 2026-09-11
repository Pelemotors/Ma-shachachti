"use client";

import { useState } from "react";
import {
  microphoneStatusLabel,
  useDevicePermissions,
} from "@/hooks/use-device-permissions";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { canPromptPushPermission, type PushUiState } from "@/lib/push-client";

function notificationCopy(state: PushUiState) {
  if (state === "unsupported") {
    return "התראות Push אינן נתמכות במכשיר הזה.";
  }
  if (state === "permission-denied") {
    return "התראות חסומות. ניתן לשנות זאת בהרשאות האתר או המכשיר.";
  }
  if (state === "active") return "התראות מאושרות, רשומות ומוכנות לשליחה.";
  if (state === "granted-unsubscribed") {
    return "הרשאה קיימת, ההתראות עדיין לא הופעלו";
  }
  if (state === "subscribed-not-ready") {
    return "המכשיר רשום, אך שירות השליחה בשרת עדיין אינו מוכן.";
  }
  return "נדרשת הרשאה כדי להפעיל התראות.";
}

export function DevicePermissionsPanel() {
  const mic = useDevicePermissions();
  const push = usePushNotifications();
  const [micBusy, setMicBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const canAskMic =
    mic.microphoneStatus === "prompt" || mic.microphoneStatus === "unknown";
  const canAskPush = canPromptPushPermission(push.state);

  async function onMic() {
    setLocalError("");
    setMicBusy(true);
    try {
      const result = await mic.requestMicrophonePermission();
      if (result.status === "denied") {
        setLocalError(
          "המיקרופון חסום. אפשר לשנות זאת בהרשאות האתר או המכשיר.",
        );
      }
    } finally {
      setMicBusy(false);
    }
  }

  return (
    <section className="settings-section">
      <h2>הרשאות במכשיר</h2>
      <div className="perm-row">
        <div>
          <strong>מיקרופון</strong>
          <p className="muted">{microphoneStatusLabel(mic.microphoneStatus)}</p>
        </div>
        {canAskMic ? (
          <button
            className="settings-action"
            type="button"
            disabled={micBusy}
            onClick={() => void onMic()}
          >
            אישור מיקרופון
          </button>
        ) : null}
      </div>
      <div className="perm-row">
        <div>
          <strong>התראות</strong>
          <p className={`push-status ${push.state}`}>
            {notificationCopy(push.state)}
          </p>
        </div>
        <div className="permission-actions">
          {canAskPush ? (
            <button
              className="settings-action"
              type="button"
              disabled={push.busy}
              onClick={() => void push.enable()}
            >
              {push.state === "granted-unsubscribed"
                ? "הפעלה מחדש"
                : "אישור והפעלה"}
            </button>
          ) : null}
          {push.state === "active" ? (
            <button
              className="settings-action"
              type="button"
              disabled={push.busy}
              onClick={() => void push.test()}
            >
              שליחת בדיקה
            </button>
          ) : null}
          {push.state === "active" ||
          push.state === "subscribed-not-ready" ? (
            <button
              className="text-button"
              type="button"
              disabled={push.busy}
              onClick={() => void push.disable()}
            >
              כיבוי במכשיר
            </button>
          ) : null}
        </div>
      </div>
      {push.message ? <p className="success-box">{push.message}</p> : null}
      {localError || push.error ? (
        <p className="error-box">{localError || push.error}</p>
      ) : null}
    </section>
  );
}
