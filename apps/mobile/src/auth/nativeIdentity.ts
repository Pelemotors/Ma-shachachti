/**
 * Platform-agnostic native identity provider.
 * Android V1 will plug Google Sign-In; iOS later plugs Apple.
 * Foundation keeps a clear interface without product UI.
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

/**
 * Stub provider — returns unavailable until Google/Apple SDKs are wired in
 * android/ / ios/ native layers. Auth session restore still works without this.
 */
export const stubNativeIdentityProvider: NativeIdentityProvider = {
  async signInWithGoogle() {
    return {
      status: "unavailable",
      reason:
        "Google Sign-In יופעל ב־Android native layer בשלב הבא. Foundation תומך בסשן Secure Storage + /api/auth/native.",
    };
  },
  async signInWithApple() {
    return {
      status: "unavailable",
      reason: "Apple Sign-In יופעל ב־iOS בשלב מאוחר יותר.",
    };
  },
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
    return "חיבור היומן מושבת עד שנטיעת מפתחות OAuth והצפנה תושלם. זה אינו feature עובד.";
  }
  if (kind === "google") {
    return "Google Sign-In מושבת עד שנטיעת GOOGLE_NATIVE_CLIENT_ID תושלם.";
  }
  return "Apple Sign-In מושבת עד שנטיעת מפתחות Apple תושלם.";
}
