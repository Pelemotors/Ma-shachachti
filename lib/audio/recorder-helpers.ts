export type RecorderPhase =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "preview"
  | "transcribing"
  | "error";

export const RECORDER_MAX_SECONDS = 90;

export const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
] as const;

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

export function appendTranscript(existing: string, transcript: string) {
  const next = transcript.trim();
  if (!next) return existing;
  const current = existing.trim();
  return current ? `${current} ${next}` : next;
}

export function inspectTranscriptionAudio(input: {
  contentLength: number;
  size: number;
  mime: string;
}):
  | { ok: true; mime: string; filename: string }
  | { ok: false; status: number; error: string } {
  if (input.contentLength > 10_500_000 || input.size > 10_000_000) {
    return { ok: false, status: 413, error: "ההקלטה ארוכה מדי." };
  }
  const mime = input.mime.split(";")[0]?.trim() ?? "";
  if (
    !(ALLOWED_AUDIO_TYPES as readonly string[]).includes(mime) ||
    mime.length === 0
  ) {
    return { ok: false, status: 400, error: "סוג קובץ האודיו אינו נתמך." };
  }
  const filename = `recording.${mime === "audio/mp4" ? "mp4" : mime.split("/")[1]}`;
  return { ok: true, mime, filename };
}

export function transcriptionModelFromEnv(
  value = process.env.OPENAI_TRANSCRIPTION_MODEL,
) {
  const model = value?.trim() ?? "";
  if (!model) return null;
  if (/^PUT_|_HERE$|changeme|replace-me/i.test(model)) return null;
  return model;
}
