"use client";

import { useCallback, useEffect, useState } from "react";

export type DevicePermissionStatus =
  | "unknown"
  | "prompt"
  | "granted"
  | "denied"
  | "unsupported"
  | "unavailable";

export type PermissionRequestResult = {
  status: DevicePermissionStatus;
  code?: string;
};

export function mapPermissionState(
  state: PermissionState | string,
): DevicePermissionStatus {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  if (state === "prompt" || state === "default") return "prompt";
  return "unknown";
}

export async function queryMicrophoneStatus(): Promise<DevicePermissionStatus> {
  if (typeof navigator === "undefined") return "unsupported";
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  const perms = navigator.permissions;
  if (!perms?.query) return "unknown";
  try {
    const result = await perms.query({
      name: "microphone" as PermissionName,
    });
    return mapPermissionState(result.state);
  } catch {
    return "unknown";
  }
}

export function queryNotificationStatus(): DevicePermissionStatus {
  if (typeof Notification === "undefined") return "unsupported";
  return mapPermissionState(Notification.permission);
}

export function mapGetUserMediaError(error: unknown): PermissionRequestResult {
  if (error instanceof DOMException) {
    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError"
    ) {
      return { status: "denied", code: "microphone_denied" };
    }
    if (error.name === "NotFoundError") {
      return { status: "unavailable", code: "microphone_unavailable" };
    }
    if (error.name === "NotReadableError") {
      return { status: "unavailable", code: "microphone_busy" };
    }
  }
  return { status: "unknown", code: "microphone_failed" };
}

export async function requestMicrophonePermission(): Promise<PermissionRequestResult> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return { status: "unsupported", code: "microphone_insecure_context" };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { status: "unsupported", code: "microphone_unsupported" };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { status: "granted" };
  } catch (error) {
    return mapGetUserMediaError(error);
  }
}

export function microphoneStatusLabel(status: DevicePermissionStatus) {
  if (status === "granted") return "מיקרופון מאושר";
  if (status === "denied") return "מיקרופון חסום";
  if (status === "unsupported") return "מיקרופון לא נתמך";
  if (status === "unavailable") return "מיקרופון לא זמין";
  return "מיקרופון ממתין לאישור";
}

export function useDevicePermissions() {
  const [microphoneStatus, setMicrophoneStatus] =
    useState<DevicePermissionStatus>("unknown");

  const refresh = useCallback(async () => {
    setMicrophoneStatus(await queryMicrophoneStatus());
  }, []);

  const requestMicrophone = useCallback(async () => {
    const result = await requestMicrophonePermission();
    setMicrophoneStatus(result.status);
    return result;
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  return {
    microphoneStatus,
    refreshPermissions: refresh,
    requestMicrophonePermission: requestMicrophone,
  };
}
