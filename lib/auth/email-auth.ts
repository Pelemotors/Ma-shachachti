/** Shared Email Auth helpers — client-safe, no secrets. */

export const MIN_PASSWORD_LENGTH = 6;

export function authRedirectUrl(path: "/auth/callback" | "/auth/reset-password") {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export function isValidEmail(value: string) {
  const email = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateNewPassword(password: string, confirm: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים.`;
  }
  if (password !== confirm) {
    return "הסיסמאות אינן תואמות.";
  }
  return null;
}

export function signupNeedsEmailVerification(session: unknown, user: {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
} | null | undefined) {
  if (session) return false;
  if (!user) return true;
  return !user.email_confirmed_at && !user.confirmed_at;
}

export function mapAuthErrorMessage(error: { message?: string; code?: string } | null | undefined) {
  const message = (error?.message || "").toLowerCase();
  const code = (error?.code || "").toLowerCase();
  if (
    code.includes("email_not_confirmed") ||
    message.includes("email not confirmed") ||
    message.includes("not confirmed")
  ) {
    return "יש לאמת את כתובת המייל לפני הכניסה.";
  }
  if (
    code.includes("over_email_send_rate_limit") ||
    message.includes("rate limit") ||
    message.includes("for security purposes")
  ) {
    return "נשלחו יותר מדי מיילים. נסי שוב בעוד כדקה.";
  }
  if (
    code.includes("user_already_registered") ||
    message.includes("already registered") ||
    message.includes("already been registered")
  ) {
    return "כבר קיים חשבון עם כתובת המייל הזו.";
  }
  if (
    code.includes("weak_password") ||
    message.includes("password") && message.includes("weak")
  ) {
    return "הסיסמה חלשה מדי. בחרי סיסמה ארוכה יותר.";
  }
  if (
    message.includes("invalid login") ||
    message.includes("invalid credentials")
  ) {
    return "פרטי ההתחברות לא נכונים או שהחשבון אינו זמין.";
  }
  if (
    message.includes("expired") ||
    code.includes("otp_expired") ||
    message.includes("token has expired")
  ) {
    return "הקישור פג תוקף. בקשי קישור חדש.";
  }
  if (
    message.includes("invalid") && (message.includes("token") || message.includes("otp"))
  ) {
    return "הקישור אינו תקין או שכבר נוצל.";
  }
  return null;
}

export function forgotPasswordNeutralMessage() {
  return "אם קיים חשבון עם הכתובת הזו, נשלח אליו קישור לאיפוס סיסמה.";
}

export function verificationEmailSentMessage() {
  return "שלחנו לך מייל לאימות החשבון. לאחר האימות אפשר להתחבר (ייתכן שיידרש גם אישור מנהל).";
}

export function verificationResentMessage() {
  return "אם החשבון ממתין לאימות — נשלח מייל חדש.";
}

export function passwordUpdatedMessage() {
  return "הסיסמה עודכנה. אפשר להתחבר עם הסיסמה החדשה.";
}

export const RESEND_COOLDOWN_MS = 60_000;
