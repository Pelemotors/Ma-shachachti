import {
  DEFAULT_REMINDER_MINUTES,
  isReminderMinuteOption,
} from "./reminders.ts";

export type PushPermission = "default" | "granted" | "denied";

export type PushUiState =
  | "unsupported"
  | "permission-required"
  | "permission-denied"
  | "granted-unsubscribed"
  | "subscribed-not-ready"
  | "active";

export const PUSH_PERMISSION_TRIGGER = "settings-button" as const;

export function notificationUiState(input: {
  supported: boolean;
  permission: PushPermission | "unsupported";
  hasSubscription: boolean;
  deliveryReady: boolean;
}): PushUiState {
  if (!input.supported || input.permission === "unsupported") {
    return "unsupported";
  }
  if (input.permission === "denied") return "permission-denied";
  if (input.permission === "default") return "permission-required";
  if (!input.hasSubscription) return "granted-unsubscribed";
  return input.deliveryReady ? "active" : "subscribed-not-ready";
}

export function canPromptPushPermission(state: PushUiState) {
  return state === "permission-required" || state === "granted-unsubscribed";
}

export function shouldAutoRequestPushPermission() {
  return false;
}

export function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function reminderSelectValue(input: {
  reminder_enabled: boolean;
  reminder_offset_minutes: number | null;
}) {
  if (!input.reminder_enabled) return "off";
  if (input.reminder_offset_minutes == null) return "default";
  return String(input.reminder_offset_minutes);
}

export function reminderPatchFromSelect(value: string) {
  if (value === "off") {
    return {
      reminder_patch: "set" as const,
      reminder_enabled: false,
      reminder_offset_minutes: null,
    };
  }
  if (value === "default") {
    return {
      reminder_patch: "set" as const,
      reminder_enabled: true,
      reminder_offset_minutes: null,
    };
  }
  const minutes = Number(value);
  if (!isReminderMinuteOption(minutes)) {
    return {
      reminder_patch: "set" as const,
      reminder_enabled: true,
      reminder_offset_minutes: DEFAULT_REMINDER_MINUTES,
    };
  }
  return {
    reminder_patch: "set" as const,
    reminder_enabled: true,
    reminder_offset_minutes: minutes,
  };
}
