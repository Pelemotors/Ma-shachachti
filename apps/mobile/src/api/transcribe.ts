import { getMobileApiBaseUrl } from "../utils/env";
import { readStoredAccessToken } from "./supabase";
import { ApiError } from "./client";

export async function transcribeRecording(input: { body: Blob; contentType: string }) {
  const token = await readStoredAccessToken();
  const response = await fetch(`${getMobileApiBaseUrl()}/api/transcribe`, {
    method: "POST",
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "Content-Type": input.contentType,
    },
    body: input.body,
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : "התמלול נכשל.";
    throw new ApiError(response.status, message, parsed);
  }
  const body = parsed as { text?: string };
  return { text: body.text ?? "" };
}
