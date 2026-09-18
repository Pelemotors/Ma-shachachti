const DISCLOSURE_KEY = "ma_mic_disclosure_v1";

export const MIC_DISCLOSURE_TITLE = "שימוש במיקרופון";

export const MIC_DISCLOSURE_BODY = [
  "מה שכחתי? משתמשת במיקרופון רק כאשר אתה בוחר להקליט.",
  "ההקלטה משמשת לתמלול ולהבנת הבקשה שלך, כדי ליצור או לעדכן משימות, תזכורות ומידע באפליקציה.",
  "ההקלטה אינה מתחילה ללא פעולה שלך.",
].join("\n\n");

export function hasAcceptedMicDisclosure(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISCLOSURE_KEY) === "1";
  } catch {
    return false;
  }
}

export function acceptMicDisclosure(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISCLOSURE_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Shows in-app disclosure before the first OS microphone prompt.
 * Returns false if the user declines.
 */
export function ensureMicDisclosureAccepted(): boolean {
  if (hasAcceptedMicDisclosure()) return true;
  const ok = window.confirm(
    `${MIC_DISCLOSURE_TITLE}\n\n${MIC_DISCLOSURE_BODY}\n\nהמשך?`,
  );
  if (ok) acceptMicDisclosure();
  return ok;
}
