export type CaptureKind = "typed" | "bank_mic" | "share" | "quick" | "chat";

export type CaptureInput = {
  kind: CaptureKind;
  text?: string | null;
  url?: string | null;
  imageCount?: number;
  transcript?: string | null;
  recordingId?: string | null;
  mutationId: string;
};

export type CaptureIntent =
  | { type: "chat_message"; text: string }
  | { type: "brain_dump"; recordingId: string; transcript: string }
  | { type: "note"; text: string }
  | { type: "link"; url: string; text?: string | null }
  | { type: "images"; count: number; text?: string | null };

export function interpretCapture(input: CaptureInput): CaptureIntent {
  if (input.kind === "bank_mic" && input.recordingId && input.transcript) {
    return {
      type: "brain_dump",
      recordingId: input.recordingId,
      transcript: input.transcript,
    };
  }
  if (input.kind === "chat" && input.transcript) {
    return { type: "chat_message", text: input.transcript };
  }
  if (input.url) {
    return { type: "link", url: input.url, text: input.text ?? null };
  }
  if ((input.imageCount ?? 0) > 0) {
    return { type: "images", count: input.imageCount ?? 0, text: input.text ?? null };
  }
  const text = (input.text ?? input.transcript ?? "").trim();
  if (input.kind === "chat") return { type: "chat_message", text };
  return { type: "note", text };
}
