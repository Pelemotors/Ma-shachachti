import { TIME_ZONE } from "../time.ts";
import type {
  NativeAuthResult,
  NativeCapability,
  PermissionState,
  SharedPayload,
} from "./contracts.ts";

const INSTALL_KEY = "ma-shachachti-installation-id";
const SHARE_KEY = "ma-shachachti-pending-share";
const STAGE_PREFIX = "ma-shachachti-stage:";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function webPermission(
  name: PermissionName,
): Promise<PermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return Promise.resolve("UNKNOWN");
  }
  return navigator.permissions
    .query({ name })
    .then((status) => {
      if (status.state === "granted") return "GRANTED" as const;
      if (status.state === "denied") return "DENIED" as const;
      return "UNKNOWN" as const;
    })
    .catch(() => "UNKNOWN" as const);
}

function unavailableAuth(provider: "apple" | "google"): NativeAuthResult {
  return {
    status: "unavailable",
    reason:
      provider === "apple"
        ? "Sign in with Apple זמין באפליקציית iOS."
        : "התחברות Google זמינה באפליקציית Android.",
  };
}

export function createWebNativeCapability(): NativeCapability {
  const deepLinkListeners = new Set<(link: { href: string; receivedAt: string }) => void>();

  return {
    async getPlatform() {
      return "web";
    },
    async getAppVersion() {
      return "0.2.0-lean";
    },
    async getBuildNumber() {
      return "web";
    },
    async getInstallationId() {
      const store = storage();
      const existing = store?.getItem(INSTALL_KEY);
      if (existing) return existing;
      const id = crypto.randomUUID();
      store?.setItem(INSTALL_KEY, id);
      return id;
    },
    async authenticateWithApple() {
      return unavailableAuth("apple");
    },
    async authenticateWithGoogle() {
      return unavailableAuth("google");
    },
    async requestNotificationPermission() {
      if (typeof Notification === "undefined") return "RESTRICTED";
      const result = await Notification.requestPermission();
      if (result === "granted") return "GRANTED";
      if (result === "denied") return "DENIED";
      return "UNKNOWN";
    },
    async getNotificationPermissionState() {
      if (typeof Notification === "undefined") return "RESTRICTED";
      if (Notification.permission === "granted") return "GRANTED";
      if (Notification.permission === "denied") return "DENIED";
      return "UNKNOWN";
    },
    async getPushToken() {
      return null;
    },
    async requestMicrophonePermission() {
      if (!navigator.mediaDevices?.getUserMedia) return "RESTRICTED";
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        return "GRANTED";
      } catch {
        return "DENIED";
      }
    },
    async getMicrophonePermissionState() {
      return webPermission("microphone" as PermissionName);
    },
    async startAudioCapture() {
      return { status: "error", message: "use_web_media_recorder" };
    },
    async stopAudioCapture() {
      return { status: "error", message: "use_web_media_recorder" };
    },
    async getInitialDeepLink() {
      if (typeof window === "undefined") return null;
      return {
        href: `${window.location.pathname}${window.location.search}`,
        receivedAt: new Date().toISOString(),
      };
    },
    subscribeToDeepLinks(listener) {
      deepLinkListeners.add(listener);
      return () => deepLinkListeners.delete(listener);
    },
    async getPendingSharedPayload() {
      const raw = storage()?.getItem(SHARE_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as SharedPayload;
      } catch {
        return null;
      }
    },
    async clearSharedPayload() {
      storage()?.removeItem(SHARE_KEY);
    },
    async pickImage() {
      return { status: "unavailable" };
    },
    async captureImage() {
      return { status: "unavailable" };
    },
    async openAppSettings() {
      /* browser has no app settings deep-link */
    },
    async getTimezone() {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || TIME_ZONE;
      } catch {
        return TIME_ZONE;
      }
    },
    async secureGet(key) {
      return storage()?.getItem(`secure:${key}`) ?? null;
    },
    async secureSet(key, value) {
      storage()?.setItem(`secure:${key}`, value);
    },
    async secureRemove(key) {
      storage()?.removeItem(`secure:${key}`);
    },
    async stageBlob(key, value) {
      storage()?.setItem(`${STAGE_PREFIX}${key}`, value);
    },
    async readStaged(key) {
      return storage()?.getItem(`${STAGE_PREFIX}${key}`) ?? null;
    },
    async clearStaged(key) {
      storage()?.removeItem(`${STAGE_PREFIX}${key}`);
    },
  };
}
