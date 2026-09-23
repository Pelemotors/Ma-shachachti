import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { apiRequest } from "../api/client";

const INSTALL_KEY = "mashachachti.installation_id.v1";

async function getInstallationId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALL_KEY);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const next =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
          const rand = (Math.random() * 16) | 0;
          const value = char === "x" ? rand : (rand & 0x3) | 0x8;
          return value.toString(16);
        });
  await SecureStore.setItemAsync(INSTALL_KEY, next);
  return next;
}

/** Register / refresh native push token on existing user_installations path. */
export async function registerNativePushDevice(input: {
  pushToken: string | null;
  permission: "GRANTED" | "DENIED" | "UNKNOWN";
  revoke?: boolean;
}) {
  const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
  const installationId = await getInstallationId();
  await apiRequest("/api/devices", {
    method: "POST",
    body: JSON.stringify({
      installationId,
      platform,
      appVersion: Application.nativeApplicationVersion ?? undefined,
      buildNumber: Application.nativeBuildVersion ?? undefined,
      pushToken: input.pushToken,
      pushProvider:
        platform === "ios" ? "apns" : platform === "android" ? "fcm" : "web_push",
      pushPermission: input.permission,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      revoke: input.revoke === true,
    }),
  });
}
