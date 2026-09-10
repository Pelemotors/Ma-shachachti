import { authFetch } from "@/lib/supabase-browser";

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
