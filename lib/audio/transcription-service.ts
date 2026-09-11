import { HttpError } from "../server-auth.ts";
import {
  inspectTranscriptionAudio,
  transcriptionModelFromEnv,
} from "./recorder-helpers.ts";

export type InspectedAudio = Extract<
  ReturnType<typeof inspectTranscriptionAudio>,
  { ok: true }
>;

export function inspectAudioBlob(blob: Blob, contentLength = blob.size) {
  const inspected = inspectTranscriptionAudio({
    contentLength,
    size: blob.size,
    mime: blob.type,
  });
  if (!inspected.ok) throw new HttpError(inspected.status, inspected.error);
  return inspected;
}

export async function transcribeAudio(
  blob: Blob,
  inspected: InspectedAudio,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = transcriptionModelFromEnv();
  if (!apiKey || !model) {
    throw new HttpError(503, "תמלול קולי עדיין לא הוגדר.");
  }

  const form = new FormData();
  form.append("file", blob, inspected.filename);
  form.append("model", model);
  form.append("language", "he");

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    },
  );
  if (!response.ok) {
    console.error("OpenAI transcription upstream error", {
      status: response.status,
    });
    throw new HttpError(502, "לא הצלחנו לתמלל. אפשר לנסות שוב.");
  }
  const data = (await response.json()) as { text?: unknown };
  const text = String(data.text ?? "")
    .trim()
    .slice(0, 6000);
  if (!text) throw new HttpError(502, "לא הצלחנו לתמלל. אפשר לנסות שוב.");
  return text;
}
