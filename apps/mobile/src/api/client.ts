import { getMobileApiBaseUrl } from "../utils/env";
import { readStoredAccessToken } from "./supabase";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export type ApiRequestInit = RequestInit & {
  /** Skip attaching Bearer token (e.g. native auth exchange). */
  anonymous?: boolean;
};

/**
 * Central HTTP layer for Mobile. Screens must not call fetch() directly.
 */
export async function apiRequest<T = unknown>(
  path: string,
  init: ApiRequestInit = {},
): Promise<T> {
  const base = getMobileApiBaseUrl();
  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (!init.anonymous) {
    const token = await readStoredAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `בקשה נכשלה (${response.status})`;
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}
