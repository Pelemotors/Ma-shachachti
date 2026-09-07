/** Pure recorder helpers — testable without MediaRecorder / browser APIs. */

import { messageForCode } from "../errors";

export type RecorderPhase =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "preview"
  | "transcribing"
  | "error";

export const RECORDER_MAX_SECONDS = 90;

export function canStartRecording(
  phase: RecorderPhase,
  startLocked: boolean,
): boolean {
  if (startLocked) return false;
  return phase === "idle" || phase === "error";
}

export function canFinishRecording(phase: RecorderPhase): boolean {
  return phase === "recording";
}

export function canSendTranscript(
  phase: RecorderPhase,
  hasBlob: boolean,
  sendLocked: boolean,
): boolean {
  if (sendLocked) return false;
  if (!hasBlob) return false;
  return phase === "preview" || phase === "error";
}

export function shouldKeepBlobAfterTranscribe(ok: boolean): boolean {
  return !ok;
}

export function formatRecordingClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function emptyLevels(count = 16): number[] {
  return Array.from({ length: count }, () => 0.1);
}

/** Independent permission outcomes — one rejection must not cancel the other. */
export type PermissionPairResult = {
  notification: "granted" | "denied" | "default" | "unsupported" | "skipped";
  microphone: "granted" | "denied" | "unsupported";
};

export function mergePermissionNotices(pair: PermissionPairResult): {
  notice?: string;
  error?: string;
} {
  const micOk = pair.microphone === "granted";
  const notifOk = pair.notification === "granted";
  if (notifOk && micOk)
    return { notice: "התראות ומיקרופון מוכנים במכשיר הזה." };
  if (notifOk && !micOk)
    return {
      notice: "התראות הופעלו. מיקרופון לא אושר — אפשר לאשר כשתלחצי על הקלטה.",
    };
  if (!notifOk && micOk)
    return {
      notice: "מיקרופון אושר.",
      error:
        pair.notification === "denied"
          ? "לא ניתנה הרשאה להתראות. אפשר לשנות אותה בהגדרות הדפדפן."
          : "ההתראות לא הופעלו במלואן.",
    };
  if (pair.notification === "denied" && pair.microphone === "denied")
    return {
      error: messageForCode("microphone_denied"),
    };
  return {};
}
