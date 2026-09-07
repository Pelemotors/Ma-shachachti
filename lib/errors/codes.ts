export const ERROR_CODES = [
  "revision_conflict",
  "ai_timeout",
  "ai_invalid_output",
  "ai_insufficient_quota",
  "ai_rate_limited",
  "ai_configuration",
  "ai_upstream",
  "proposal_expired",
  "state_save_failed",
  "state_read_failed",
  "auth_required",
  "session_expired",
  "account_not_approved",
  "cloud_not_configured",
  "backend_not_configured",
  "invalid_input",
  "invalid_json",
  "missing_body",
  "payload_too_large",
  "hourly_limit",
  "budget_unavailable",
  "reminder_read_failed",
  "microphone_denied",
  "transcription_failed",
  "transcription_consent_required",
  "transcription_not_configured",
  "scan_analysis_failed",
  "recording_unsupported",
  "request_failed",
  "internal_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Canonical Hebrew messages for UI mapping. Server may still send message text. */
export const ERROR_MESSAGES_HE: Record<ErrorCode, string> = {
  revision_conflict: "המידע השתנה בחלון אחר. טענו מחדש לפני ניסיון נוסף.",
  ai_timeout: "הסוכן לא הצליח לענות בזמן. לא בוצעו שינויים; אפשר לנסות שוב.",
  ai_invalid_output: "התשובה מהסוכן לא הייתה תקינה. לא בוצעו שינויים.",
  ai_insufficient_quota:
    "מכסת ה-AI הסתיימה כרגע. לא בוצעו שינויים; אפשר להמשיך ידנית או לנסות לאחר חידוש הקרדיט.",
  ai_rate_limited:
    "שירות ה-AI עמוס כרגע. לא בוצעו שינויים; אפשר לנסות שוב בעוד רגע.",
  ai_configuration: "חיבור ה-AI דורש תיקון בהגדרות השרת. לא בוצעו שינויים.",
  ai_upstream: "הסוכן לא הצליח לענות כרגע. לא בוצעו שינויים; אפשר לנסות שוב.",
  proposal_expired: "המידע השתנה מאז ההצעה. יש לבקש הצעה חדשה.",
  state_save_failed: "השמירה לא הצליחה. השינוי עדיין לא נשמר.",
  state_read_failed: "לא ניתן לקרוא את המידע בענן.",
  auth_required: "צריך להתחבר כדי להמשיך.",
  session_expired: "ההתחברות הסתיימה. יש להתחבר שוב.",
  account_not_approved: "החשבון ממתין לאישור מנהל.",
  cloud_not_configured: "שמירה בענן עדיין לא מחוברת.",
  backend_not_configured: "שירות הרקע עדיין לא הוגדר.",
  invalid_input: "המידע שנשלח אינו תקין.",
  invalid_json: "הבקשה אינה תקינה.",
  missing_body: "חסר תוכן.",
  payload_too_large: "הבקשה גדולה מדי.",
  hourly_limit:
    "הגענו למכסת הבקשות לשעה. אפשר להמשיך לנהל משימות ולנסות שוב בהמשך.",
  budget_unavailable: "בקרת השימוש אינה זמינה.",
  reminder_read_failed: "לא ניתן לקרוא את מצב התזכורות.",
  microphone_denied:
    "לא ניתנה גישה למיקרופון. אפשר לשנות בהגדרות הדפדפן או להקליד.",
  transcription_failed: "לא הצלחתי לתמלל. אפשר לנסות שוב או להקליד.",
  transcription_consent_required: "נדרשת הסכמה לשימוש בשירות התמלול.",
  transcription_not_configured: "התמלול עדיין לא מחובר. אפשר להקליד.",
  scan_analysis_failed: "הסקירה שלך נשמרה, אבל לא הצלחתי לנתח אותה כרגע.",
  recording_unsupported: "הדפדפן הזה לא מאפשר הקלטה.",
  request_failed: "הפעולה לא הושלמה. אפשר לנסות שוב.",
  internal_error: "הפעולה לא הושלמה. אפשר לנסות שוב.",
};

export function messageForCode(code: string, fallback?: string) {
  return (
    ERROR_MESSAGES_HE[code as ErrorCode] ??
    fallback ??
    ERROR_MESSAGES_HE.internal_error
  );
}
