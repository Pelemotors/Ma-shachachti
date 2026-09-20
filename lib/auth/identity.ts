export type IdentityProvider = "apple" | "google" | "email";

export type StoredIdentity = {
  userId: string;
  provider: IdentityProvider;
  providerSubject: string;
};

export type IdentityDecision =
  | { action: "login"; userId: string }
  | { action: "link"; userId: string }
  | { action: "create" }
  | { action: "reject_takeover"; reason: string };

export function decideIdentityLink(input: {
  provider: Exclude<IdentityProvider, "email">;
  providerSubject: string;
  existingBySubject: StoredIdentity | null;
  authenticatedUserId: string | null;
}): IdentityDecision {
  const subject = input.existingBySubject;
  if (subject) {
    if (
      input.authenticatedUserId &&
      input.authenticatedUserId !== subject.userId
    ) {
      return {
        action: "reject_takeover",
        reason: "ספק הזהות כבר משויך למשתמש אחר.",
      };
    }
    return { action: "login", userId: subject.userId };
  }
  if (input.authenticatedUserId) {
    return { action: "link", userId: input.authenticatedUserId };
  }
  return { action: "create" };
}

export const NOTIFICATION_KINDS = [
  "TASK_DUE",
  "TASK_OVERDUE",
  "REMINDER",
  "ROUTINE_DUE",
  "SCHEDULE_ATTENTION",
  "SHOPPING_ATTENTION",
  "AGENT_ATTENTION",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export function notificationLogicalKey(
  kind: NotificationKind,
  subject: string,
) {
  return `${kind}:${subject}`;
}

export const TELEMETRY_EVENTS = [
  "APP_OPEN",
  "LOGIN_STARTED",
  "LOGIN_SUCCEEDED",
  "LOGIN_FAILED",
  "DEVICE_REGISTERED",
  "PUSH_PERMISSION",
  "PUSH_RECEIVED",
  "PUSH_OPENED",
  "DEEP_LINK_OPENED",
  "SHARE_RECEIVED",
  "CAPTURE_STAGED",
  "CAPTURE_PROCESSED",
  "AUDIO_STARTED",
  "AUDIO_STAGED",
  "TRANSCRIPTION_SUCCEEDED",
  "TRANSCRIPTION_FAILED",
  "SYNC_FAILED",
  "SCREEN_VIEW",
  "TASK_COMPLETED",
  "DAY_PLAN_UPDATED",
  "DAY_PLAN_REPLANNED",
  "HOUSEHOLD_JOINED",
  "CALENDAR_CONNECTED",
  "CALENDAR_DISCONNECTED",
  "JOB_ENQUEUED",
  "JOB_COMPLETED",
] as const;

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];

export function isTelemetryEvent(value: string): value is TelemetryEvent {
  return (TELEMETRY_EVENTS as readonly string[]).includes(value);
}

export const DEFAULT_FEATURE_FLAGS = {
  NATIVE_PUSH_ENABLED: false,
  SHARE_CAPTURE_ENABLED: true,
  MOBILE_VOICE_ENABLED: true,
  MONETIZATION_ENABLED: false,
} as const;

export type FeatureFlagName = keyof typeof DEFAULT_FEATURE_FLAGS;

export function resolveFeatureFlags(
  overrides: Partial<Record<FeatureFlagName, boolean>> = {},
) {
  return { ...DEFAULT_FEATURE_FLAGS, ...overrides };
}

export function envFlag(name: FeatureFlagName, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return fallback;
}
