import * as Application from "expo-application";
import { AppState, Linking, Platform } from "react-native";
import { registerNativePushDevice } from "./registerDevice";

type NotificationsMod = typeof import("expo-notifications");

let handlerReady = false;
let responseSub: { remove: () => void } | null = null;

async function loadNotifications(): Promise<NotificationsMod> {
  return import("expo-notifications");
}

export async function resolveNativePushToken(): Promise<string | null> {
  const Notifications = await loadNotifications();
  try {
    const device = await Notifications.getDevicePushTokenAsync();
    if (typeof device.data === "string" && device.data.trim()) return device.data;
  } catch {
    /* missing google-services / APNs */
  }
  try {
    const expo = await Notifications.getExpoPushTokenAsync();
    return expo.data ?? null;
  } catch {
    return null;
  }
}

export async function openAppNotificationSettings() {
  if (Platform.OS === "android") {
    try {
      const pkg = Application.applicationId ?? "com.mashachachti.app";
      await Linking.sendIntent("android.settings.APP_NOTIFICATION_SETTINGS", [
        { key: "android.provider.extra.APP_PACKAGE", value: pkg },
        { key: "app_package", value: pkg },
      ]);
      return;
    } catch {
      /* fall through to app settings */
    }
  }
  await Linking.openSettings();
}

export async function syncNativePushRegistration() {
  const Notifications = await loadNotifications();
  await ensureNotificationRuntime(Notifications);
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted) {
    await registerNativePushDevice({
      pushToken: null,
      permission: current.canAskAgain === false ? "DENIED" : "UNKNOWN",
    });
    return;
  }
  const token = await resolveNativePushToken();
  await registerNativePushDevice({
    pushToken: token,
    permission: "GRANTED",
  });
}

export async function revokeNativePushRegistration() {
  await registerNativePushDevice({
    pushToken: null,
    permission: "DENIED",
    revoke: true,
  });
}

async function ensureNotificationRuntime(Notifications: NotificationsMod) {
  if (!handlerReady) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerReady = true;
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("reminders", {
      name: "תזכורות",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#BC6E45",
    });
  }
  if (!responseSub) {
    responseSub = Notifications.addNotificationResponseReceivedListener(() => {
      /* default tap already foregrounds the app */
    });
  }
}

/** Lazy — do not import expo-notifications at JS boot. */
export async function bootstrapNativePush() {
  const Notifications = await loadNotifications();
  await ensureNotificationRuntime(Notifications);
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    await syncNativePushRegistration();
  }
}

export function watchForegroundPushRefresh(onActive: () => void) {
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") onActive();
  });
  return () => sub.remove();
}
