import { Platform } from "react-native";

export function mapNativeGoogleFailure(code?: string): NativeIdentityResult {
  switch (code) {
    case "SIGN_IN_CANCELLED":
    case "12501":
      return { status: "cancelled" };
    case "PLAY_SERVICES_NOT_AVAILABLE":
    case "2":
      return { status: "unavailable", reason: "שירותי Google Play אינם זמינים במכשיר." };
    case "IN_PROGRESS":
      return { status: "unavailable", reason: "ההתחברות כבר בתהליך." };
    case "DEVELOPER_ERROR":
    case "10":
      return { status: "unavailable", reason: "הגדרת Google Sign-In שגויה. נדרשת בדיקת owner." };
    case "NETWORK_ERROR":
    case "7":
      return { status: "unavailable", reason: "אין חיבור לרשת. נסי שוב." };
    default:
      return { status: "unavailable", reason: "ההתחברות עם Google נכשלה." };
  }
}

/**
 * Platform-agnostic native identity provider.
 * Android wires Google Sign-In. Apple stays a future-work stub.
 */

export type NativeIdentityResult =
  | {
      status: "ok";
      identityToken: string;
      nonce?: string | null;
      fullName?: string | null;
    }
  | { status: "cancelled" }
  | { status: "unavailable"; reason: string };

export type NativeIdentityProvider = {
  signInWithGoogle(): Promise<NativeIdentityResult>;
  signInWithApple(): Promise<NativeIdentityResult>;
};

const appleStub: NativeIdentityProvider["signInWithApple"] = async () => ({
  status: "unavailable",
  reason: "Apple Sign-In יופעל ב־iOS בשלב מאוחר יותר.",
});

const stubNativeIdentityProvider: NativeIdentityProvider = {
  async signInWithGoogle() {
    return {
      status: "unavailable",
      reason: "Google Sign-In זמין באנדרואיד אחרי בניית native client.",
    };
  },
  signInWithApple: appleStub,
};

let activeProvider: NativeIdentityProvider = stubNativeIdentityProvider;

export function setNativeIdentityProvider(provider: NativeIdentityProvider) {
  activeProvider = provider;
}

export function getNativeIdentityProvider() {
  return activeProvider;
}

export function nativeOAuthHint(kind: "google" | "apple" | "calendar") {
  if (kind === "calendar") {
    return "חיבור היומן מושבת עד שנטיעת מפתחות OAuth והצפנה תושלם.";
  }
  if (kind === "google") {
    return Platform.OS === "android"
      ? "מתחברים עם חשבון Google ללא הרשאת יומן."
      : "Google Sign-In זמין באנדרואיד.";
  }
  return "Apple Sign-In יופעל ב־iOS בשלב מאוחר יותר.";
}
