/** Pure recording origin helpers — safe for strip-types unit tests. */

export const RECORDING_ORIGINS = ["chat", "bank", "share", "other"] as const;
export type RecordingOrigin = (typeof RECORDING_ORIGINS)[number];

export function parseRecordingOrigin(value: string | null): RecordingOrigin {
  if (
    value === "chat" ||
    value === "bank" ||
    value === "share" ||
    value === "other"
  ) {
    return value;
  }
  return "chat";
}
