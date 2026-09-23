/**
 * WEEK-01 LOCAL QA CLOCK — removable.
 * BUSINESS TIME ONLY. Never use this for JWT, session refresh, OAuth, TLS, or timeouts.
 * Mobile reads the same frozen business time as the local backend.
 * Enabled only when EXPO_PUBLIC_WEEK_SIMULATION_QA is baked in.
 * Production Play/Vercel builds omit that flag, so the clock stays off.
 */
import { getMobileApiBaseUrl, isWeekSimulationQaEnabled } from "../utils/env";

let cachedIso: string | null = null;

export function isMobileQaClockEnabled() {
  return isWeekSimulationQaEnabled();
}

export function isProductClockReady() {
  if (!isMobileQaClockEnabled()) return true;
  return cachedIso != null;
}

/** Real wall clock — auth, refresh, timeouts. */
export function wallNow(): Date {
  return new Date();
}

export function productNow(): Date {
  if (!isMobileQaClockEnabled()) return wallNow();
  if (cachedIso) return new Date(cachedIso);
  return wallNow();
}

export function productNowMs() {
  return productNow().getTime();
}

export function productIsoNow() {
  return productNow().toISOString();
}

export function productToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(productNow());
}

export const ProductClock = {
  now: productNow,
  today: productToday,
  isoNow: productIsoNow,
  nowMs: productNowMs,
};

export async function syncProductClock() {
  if (!isMobileQaClockEnabled()) return;
  try {
    const response = await fetch(`${getMobileApiBaseUrl()}/api/qa-clock`);
    if (!response.ok) return;
    const data = (await response.json()) as { iso?: string; source?: string };
    if (data.source === "qa" && data.iso) {
      cachedIso = data.iso;
    }
  } catch {
    /* keep previous cache across reload if the fetch fails briefly */
  }
}

export function __setProductClockIsoForTests(iso: string | null) {
  cachedIso = iso;
}
