import type { TelemetryEvent } from "./auth/identity.ts";

const BLOCKED = /token|password|email|transcript|audio|authorization|refresh/i;

export function sanitizeTelemetryMetadata(
  metadata: Record<string, unknown> | undefined,
) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (BLOCKED.test(key)) continue;
    if (typeof value === "string" && value.length > 80) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

export function logMobileEvent(
  event: TelemetryEvent,
  metadata?: Record<string, unknown>,
) {
  console.info(
    JSON.stringify({
      event,
      ...sanitizeTelemetryMetadata(metadata),
    }),
  );
}
