import { createWebNativeCapability } from "./web-adapter.ts";
import type {
  AudioCaptureResult,
  DeepLinkPayload,
  ImagePickResult,
  NativeAuthResult,
  NativeCapability,
  NativePlatform,
  PermissionState,
  SharedPayload,
} from "./contracts.ts";

type PluginFn = {
  [key: string]: ((payload?: Record<string, unknown>) => Promise<unknown>) | undefined;
};

function plugin(): PluginFn | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as Window & {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        Plugins?: Record<string, PluginFn>;
      };
    }
  ).Capacitor;
  if (!cap?.isNativePlatform?.() || !cap.Plugins?.MaNative) return null;
  return cap.Plugins.MaNative;
}

function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === "object" && "value" in (raw as object)) {
    return (raw as { value: T }).value;
  }
  return raw as T;
}

function isNativePlatform() {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.(),
  );
}

async function call<T>(
  method: string,
  fallback: () => Promise<T>,
  payload?: Record<string, unknown>,
): Promise<T> {
  const native = plugin();
  const fn = native?.[method];
  if (!fn) return fallback();
  try {
    const raw = await fn(payload);
    return unwrap<T>(raw);
  } catch {
    return fallback();
  }
}

async function callSecure<T>(
  method: string,
  fallback: () => Promise<T>,
  empty: T,
  payload?: Record<string, unknown>,
): Promise<T> {
  const native = plugin();
  const fn = native?.[method];
  if (!fn) {
    // Never park auth secrets in WebView localStorage on a native shell.
    if (isNativePlatform()) return empty;
    return fallback();
  }
  try {
    const raw = await fn(payload);
    return unwrap<T>(raw);
  } catch {
    if (isNativePlatform()) return empty;
    return fallback();
  }
}

export function createCapacitorNativeCapability(): NativeCapability {
  const web = createWebNativeCapability();
  const listeners = new Set<(link: DeepLinkPayload) => void>();

  if (typeof window !== "undefined") {
    window.addEventListener("ma-native-deeplink", ((event: Event) => {
      const href = (event as CustomEvent<{ href?: string }>).detail?.href;
      if (!href) return;
      const link = { href, receivedAt: new Date().toISOString() };
      listeners.forEach((listener) => listener(link));
    }) as EventListener);
  }

  return {
    getPlatform: () => call<NativePlatform>("getPlatform", web.getPlatform),
    getAppVersion: () => call("getAppVersion", web.getAppVersion),
    getBuildNumber: () => call("getBuildNumber", web.getBuildNumber),
    getInstallationId: () => call("getInstallationId", web.getInstallationId),
    authenticateWithApple: async () => {
      const raw = await call<NativeAuthResult | Record<string, unknown>>(
        "authenticateWithApple",
        web.authenticateWithApple,
      );
      return raw as NativeAuthResult;
    },
    authenticateWithGoogle: async () => {
      const raw = await call<NativeAuthResult | Record<string, unknown>>(
        "authenticateWithGoogle",
        web.authenticateWithGoogle,
      );
      return raw as NativeAuthResult;
    },
    requestNotificationPermission: () =>
      call<PermissionState>(
        "requestNotificationPermission",
        web.requestNotificationPermission,
      ),
    getNotificationPermissionState: () =>
      call<PermissionState>(
        "getNotificationPermissionState",
        web.getNotificationPermissionState,
      ),
    getPushToken: () => call("getPushToken", web.getPushToken),
    requestMicrophonePermission: () =>
      call<PermissionState>(
        "requestMicrophonePermission",
        web.requestMicrophonePermission,
      ),
    getMicrophonePermissionState: () =>
      call<PermissionState>(
        "getMicrophonePermissionState",
        web.getMicrophonePermissionState,
      ),
    startAudioCapture: async () => {
      const raw = await call("startAudioCapture", web.startAudioCapture);
      return raw as Awaited<ReturnType<NativeCapability["startAudioCapture"]>>;
    },
    stopAudioCapture: async () => {
      const raw = await call<AudioCaptureResult>("stopAudioCapture", web.stopAudioCapture);
      return raw;
    },
    getInitialDeepLink: async () => {
      const raw = await call<DeepLinkPayload | null | Record<string, unknown>>(
        "getInitialDeepLink",
        web.getInitialDeepLink,
      );
      if (!raw || typeof raw !== "object") return null;
      if ("href" in raw && raw.href) return raw as DeepLinkPayload;
      return null;
    },
    subscribeToDeepLinks(listener) {
      listeners.add(listener);
      const inner = web.subscribeToDeepLinks(listener);
      return () => {
        listeners.delete(listener);
        inner();
      };
    },
    getPendingSharedPayload: async () => {
      const raw = await call<SharedPayload | null>(
        "getPendingSharedPayload",
        web.getPendingSharedPayload,
      );
      if (!raw || typeof raw !== "object") return null;
      if ("id" in raw) return raw;
      return null;
    },
    clearSharedPayload: () => call("clearSharedPayload", web.clearSharedPayload),
    pickImage: () => call<ImagePickResult>("pickImage", web.pickImage),
    captureImage: () => call<ImagePickResult>("captureImage", web.captureImage),
    openAppSettings: () => call("openAppSettings", web.openAppSettings),
    getTimezone: () => call("getTimezone", web.getTimezone),
    secureGet: (key) =>
      callSecure("secureGet", () => web.secureGet(key), null, { key }),
    secureSet: async (key, value) => {
      await callSecure("secureSet", () => web.secureSet(key, value), undefined, {
        key,
        value,
      });
    },
    secureRemove: async (key) => {
      await callSecure("secureRemove", () => web.secureRemove(key), undefined, {
        key,
      });
    },
    stageBlob: async (key, value) => {
      await callSecure("stageBlob", () => web.stageBlob(key, value), undefined, {
        key,
        value,
      });
    },
    readStaged: (key) =>
      callSecure("readStaged", () => web.readStaged(key), null, { key }),
    clearStaged: async (key) => {
      await callSecure("clearStaged", () => web.clearStaged(key), undefined, {
        key,
      });
    },
  };
}
