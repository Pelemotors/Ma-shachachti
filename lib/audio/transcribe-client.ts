import { authFetch } from "@/lib/supabase-browser";
import { messageForCode } from "@/lib/errors";

export async function transcribeAudioBlob(blob: Blob): Promise<string> {
  const response = await authFetch("/api/transcribe", {
    method: "POST",
    body: blob,
  });
  let data: { text?: string; error?: string; code?: string } = {};
  try {
    data = await response.json();
  } catch {
    /* non-json */
  }
  if (!response.ok)
    throw new Error(
      messageForCode(data.code ?? "transcription_failed", data.error),
    );
  const text = String(data.text ?? "").trim();
  if (!text) throw new Error(messageForCode("transcription_failed"));
  return text;
}
