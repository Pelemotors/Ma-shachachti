import { productNow } from "./productClock";

export function jerusalemHour(now = productNow()) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
}

export function daypartGreeting(now = productNow()) {
  const hour = jerusalemHour(now);
  return hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : "ערב טוב";
}

export function timeGreeting(name?: string | null, now = productNow()) {
  const part = daypartGreeting(now);
  const trimmed = name?.trim();
  return trimmed ? `${part}, ${trimmed}.` : `${part}.`;
}

/** First name for greeting. Never an email local-part or dotted/numeric handle. */
export function greetingName(displayName?: string | null) {
  const raw = displayName?.trim();
  if (!raw) return null;
  if (raw.includes("@")) return null;
  const first = raw.split(/\s+/)[0] ?? "";
  if (first.length < 2) return null;
  if (/[0-9._]/.test(first) && !/[\u0590-\u05FF]/.test(first)) return null;
  return first;
}
