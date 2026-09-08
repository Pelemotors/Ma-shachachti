"use client";

import { useCallback, useEffect, useState } from "react";

export type DevicePermissionStatus =
  "unknown" | "prompt" | "granted" | "denied" | "unsupported" | "unavailable";

export type PermissionRequestResult = {
  status: DevicePermissionStatus;
  code?: string;
};

function mapPermissionState(
  state: PermissionState | string,
): DevicePermissionStatus {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  if (state === "prompt" || state === "default") return "prompt";
  return "unknown";
}

/** Pure helpers — unit-testable without React. */
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
    return {
      status: "unsupported",
      code: "microphone_insecure_context",
    };
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

export async function requestNotificationPermission(): Promise<PermissionRequestResult> {
  if (typeof Notification === "undefined") {
    return {
      status: "unsupported",
      code: "notification_unsupported",
    };
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") return { status: "granted" };
  if (permission === "denied") {
    return { status: "denied", code: "notification_denied" };
  }
  return { status: "prompt" };
}

export function useDevicePermissions() {
  const [microphoneStatus, setMicrophoneStatus] =
    useState<DevicePermissionStatus>("unknown");
  const [notificationStatus, setNotificationStatus] =
    useState<DevicePermissionStatus>("unknown");

  const refreshPermissions = useCallback(async () => {
    const [mic, notif] = await Promise.all([
      queryMicrophoneStatus(),
      Promise.resolve(queryNotificationStatus()),
    ]);
    setMicrophoneStatus(mic);
    setNotificationStatus(notif);
  }, []);

  const requestMicrophone = useCallback(async () => {
    const result = await requestMicrophonePermission();
    setMicrophoneStatus(result.status);
    setNotificationStatus(queryNotificationStatus());
    const queried = await queryMicrophoneStatus();
    if (
      queried === "granted" ||
      queried === "denied" ||
      queried === "prompt" ||
      queried === "unsupported"
    ) {
      setMicrophoneStatus(queried);
    }
    return result;
  }, []);

  const requestNotification = useCallback(async () => {
    const result = await requestNotificationPermission();
    setNotificationStatus(result.status);
    const queried = queryNotificationStatus();
    if (queried !== "unknown") setNotificationStatus(queried);
    const mic = await queryMicrophoneStatus();
    setMicrophoneStatus(mic);
    return result;
  }, []);

  useEffect(() => {
    void refreshPermissions();
    const onFocus = () => void refreshPermissions();
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshPermissions();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshPermissions]);

  return {
    microphoneStatus,
    notificationStatus,
    refreshPermissions,
    requestMicrophonePermission: requestMicrophone,
    requestNotificationPermission: requestNotification,
  };
}
