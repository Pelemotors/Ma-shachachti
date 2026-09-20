import { apiRequest } from "./client";
import { getMobileApiBaseUrl } from "../utils/env";
import { readStoredAccessToken } from "./supabase";
import { ApiError } from "./client";

export type MobileRecording = {
  id: string;
  status: string;
  origin: string;
  created_at: string;
};

export async function listBankRecordings() {
  return apiRequest<{ recordings: MobileRecording[] }>(
    "/api/recordings?origin=bank",
  );
}

export async function uploadBankRecording(input: {
  id: string;
  durationSec: number;
  body: Blob;
  contentType: string;
}) {
  const token = await readStoredAccessToken();
  const response = await fetch(`${getMobileApiBaseUrl()}/api/recordings`, {
    method: "POST",
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "Content-Type": input.contentType,
      "x-recording-id": input.id,
      "x-recording-duration": String(input.durationSec),
      "x-recording-origin": "bank",
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
        : "העלאת ההקלטה נכשלה.";
    throw new ApiError(response.status, message, parsed);
  }
  return parsed as { recording: MobileRecording };
}
