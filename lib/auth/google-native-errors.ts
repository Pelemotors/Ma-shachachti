export type MappedGoogleNativeResult =
  | { status: "cancelled" }
  | { status: "unavailable"; reason: string };

export function mapNativeGoogleFailure(code?: string): MappedGoogleNativeResult {
  switch (code) {
    case "SIGN_IN_CANCELLED":
    case "12501":
      return { status: "cancelled" };
    case "PLAY_SERVICES_NOT_AVAILABLE":
    case "2":
      return {
        status: "unavailable",
        reason: "שירותי Google Play אינם זמינים במכשיר.",
      };
    case "IN_PROGRESS":
      return { status: "unavailable", reason: "ההתחברות כבר בתהליך." };
    case "DEVELOPER_ERROR":
    case "10":
      return {
        status: "unavailable",
        reason: "הגדרת Google Sign-In שגויה. נדרשת בדיקת owner.",
      };
    case "NETWORK_ERROR":
    case "7":
      return { status: "unavailable", reason: "אין חיבור לרשת. נסי שוב." };
    default:
      return { status: "unavailable", reason: "ההתחברות עם Google נכשלה." };
  }
}
