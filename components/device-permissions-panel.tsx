"use client";

import { useState } from "react";
import {
  useDevicePermissions,
  type DevicePermissionStatus,
} from "@/hooks/use-device-permissions";
import { messageForCode } from "@/lib/errors";

function microphoneStatusLabel(status: DevicePermissionStatus): string {
  switch (status) {
    case "granted":
      return "מיקרופון מאושר";
    case "denied":
      return "מיקרופון חסום בדפדפן";
    case "unsupported":
      return "מיקרופון לא נתמך כאן";
    case "unavailable":
      return "מיקרופון לא זמין במכשיר";
    case "prompt":
    case "unknown":
      return "מיקרופון ממתין לאישור";
  }
}

function notificationStatusLabel(
  status: DevicePermissionStatus,
  pushEnabled: boolean,
): string {
  if (status === "unsupported") return "התראות לא נתמכות כאן";
  if (status === "denied") return "התראות חסומות בדפדפן";
  if (status === "granted" && pushEnabled) return "מאושרות ופעילות";
  if (status === "granted") return "הרשאה מאושרת";
  if (status === "unavailable") return "התראות לא זמינות";
  return "התראות ממתינות לאישור";
}

export function DevicePermissionsPanel(props: {
  pushEnabled: boolean;
  pushBusy: boolean;
  pushReady?: boolean;
  onEnablePush: () => void | Promise<void>;
  mode?: string;
}) {
  const perms = useDevicePermissions();
  const [busyMic, setBusyMic] = useState(false);
  const [busyNotif, setBusyNotif] = useState(false);
  const [localError, setLocalError] = useState("");

  const canAskMic =
    perms.microphoneStatus === "prompt" || perms.microphoneStatus === "unknown";
  const canAskNotif =
    perms.notificationStatus === "prompt" ||
    perms.notificationStatus === "unknown";
  const canActivatePush =
    props.mode !== "local" &&
    perms.notificationStatus === "granted" &&
    !props.pushEnabled &&
    (props.pushReady ?? true);

  async function onMic() {
    setLocalError("");
    setBusyMic(true);
    try {
      const result = await perms.requestMicrophonePermission();
      if (result.code && result.status !== "granted") {
        setLocalError(messageForCode(result.code));
      }
    } finally {
      setBusyMic(false);
    }
  }

  async function onNotif() {
    setLocalError("");
    setBusyNotif(true);
    try {
      const result = await perms.requestNotificationPermission();
      if (result.status === "granted") {
        if (props.mode !== "local") await props.onEnablePush();
      } else if (result.code) {
        setLocalError(messageForCode(result.code));
      }
    } finally {
      setBusyNotif(false);
    }
  }

  return (
    <section className="panel stack" aria-labelledby="device-permissions-title">
      <h3 id="device-permissions-title">הרשאות במכשיר</h3>
      {props.mode === "local" && (
        <p className="muted">
          בהדגמה מקומית אין שליחת התראות ברקע. אפשר עדיין לאשר מיקרופון במכשיר.
        </p>
      )}

      <div className="list-row">
        <div>
          <strong>מיקרופון</strong>
          <p className="muted">
            {microphoneStatusLabel(perms.microphoneStatus)}
          </p>
          {perms.microphoneStatus === "denied" && (
            <p className="muted">
              המיקרופון חסום. אפשר לשנות זאת בהרשאות הדפדפן או המכשיר.
            </p>
          )}
        </div>
        {canAskMic && (
          <button
            type="button"
            className="secondary"
            disabled={busyMic}
            onClick={() => void onMic()}
          >
            אישור מיקרופון
          </button>
        )}
      </div>

      <div className="list-row">
        <div>
          <strong>התראות</strong>
          <p className="muted">
            {notificationStatusLabel(
              perms.notificationStatus,
              props.pushEnabled,
            )}
          </p>
          {perms.notificationStatus === "denied" && (
            <p className="muted">אפשר לאפשר התראות מחדש בהרשאות האתר בדפדפן.</p>
          )}
        </div>
        {canAskNotif && props.mode !== "local" && (
          <button
            type="button"
            className="secondary"
            disabled={busyNotif || props.pushBusy || props.pushReady === false}
            onClick={() => void onNotif()}
          >
            {props.pushReady === false
              ? "שליחת התראות עדיין לא מחוברת"
              : "אישור התראות"}
          </button>
        )}
        {canActivatePush && (
          <button
            type="button"
            className="secondary"
            disabled={props.pushBusy}
            onClick={() => void props.onEnablePush()}
          >
            הפעלת התראות במכשיר
          </button>
        )}
      </div>

      {localError && (
        <p className="voice-recorder__error" role="alert">
          {localError}
        </p>
      )}
    </section>
  );
}
