import { authFetch } from "@/lib/supabase-browser";

type ProcessedRecording = {
  recording?: {
    id: string;
    transcript: string | null;
    status: string;
  };
  recording_id?: string;
  error?: string;
};

export async function transcribeAudioBlob(blob: Blob): Promise<string> {
  const response = await authFetch("/api/transcribe", {
    method: "POST",
    body: blob,
  });
  let data: { text?: string; error?: string } = {};
  try {
    data = await response.json();
  } catch {
    /* non-json */
  }
  if (response.status === 401) {
    throw new Error("צריך להתחבר כדי לתמלל.");
  }
  if (!response.ok) {
    throw new Error(data.error ?? "לא הצלחנו לתמלל. אפשר לנסות שוב.");
  }
  const text = String(data.text ?? "").trim();
  if (!text) throw new Error("לא הצלחנו לתמלל. אפשר לנסות שוב.");
  return text;
}

export async function processRecordingBlob(
  blob: Blob,
  recordingId: string,
  durationSeconds: number,
): Promise<string> {
  const response = await authFetch("/api/recordings", {
    method: "POST",
    headers: {
      "Content-Type": blob.type,
      "X-Recording-Id": recordingId,
      "X-Recording-Duration": String(durationSeconds),
    },
    body: blob,
  });
  const data = (await response.json().catch(() => ({}))) as ProcessedRecording;
  if (response.status === 401) throw new Error("צריך להתחבר כדי לתמלל.");
  if (!response.ok) {
    throw new Error(data.error ?? "לא הצלחנו לתמלל. אפשר לנסות שוב.");
  }
  const text = String(data.recording?.transcript ?? "").trim();
  if (!text) throw new Error("לא הצלחנו לתמלל. אפשר לנסות שוב.");
  return text;
}
