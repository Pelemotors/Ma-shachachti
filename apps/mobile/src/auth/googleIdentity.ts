import { GoogleSignin, isErrorWithCode, statusCodes } from "@react-native-google-signin/google-signin";
import { apiRequest } from "../api/client";
import {
  mapNativeGoogleFailure,
  type NativeIdentityProvider,
  type NativeIdentityResult,
} from "./nativeIdentity";

type PublicOAuthConfig = {
  google: { enabled: boolean; webClientId: string | null };
};

let configuredWebClientId: string | null = null;

async function ensureGoogleConfigured() {
  if (configuredWebClientId) return configuredWebClientId;
  const config = await apiRequest<PublicOAuthConfig>("/api/mobile/oauth-config", {
    anonymous: true,
  });
  const webClientId = config.google?.webClientId;
  if (!config.google?.enabled || !webClientId) {
    throw Object.assign(new Error("google_unconfigured"), { code: "DEVELOPER_ERROR" });
  }
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
    forceCodeForRefreshToken: false,
  });
  configuredWebClientId = webClientId;
  return webClientId;
}

function resultFromUnknown(error: unknown): NativeIdentityResult {
  const code = isErrorWithCode(error) ? String(error.code) : undefined;
  if (code === String(statusCodes.SIGN_IN_CANCELLED)) return mapNativeGoogleFailure("SIGN_IN_CANCELLED");
  if (code === String(statusCodes.PLAY_SERVICES_NOT_AVAILABLE)) {
    return mapNativeGoogleFailure("PLAY_SERVICES_NOT_AVAILABLE");
  }
  if (code === String(statusCodes.IN_PROGRESS)) return mapNativeGoogleFailure("IN_PROGRESS");
  return mapNativeGoogleFailure(code);
}

export const googleNativeIdentityProvider: NativeIdentityProvider = {
  async signInWithGoogle() {
    try {
      await ensureGoogleConfigured();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (response.type === "cancelled") {
        return { status: "cancelled" };
      }
      const idToken = response.data.idToken;
      if (!idToken) {
        return { status: "unavailable", reason: "Google לא החזיר אסימון זהות." };
      }
      return {
        status: "ok",
        identityToken: idToken,
        fullName: response.data.user.name,
      };
    } catch (error) {
      return resultFromUnknown(error);
    }
  },
  async signInWithApple() {
    return {
      status: "unavailable",
      reason: "Apple Sign-In יופעל ב־iOS בשלב מאוחר יותר.",
    };
  },
};
