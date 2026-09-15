export type NativePlatform = "web" | "ios" | "android";

export type PermissionState =
  | "UNKNOWN"
  | "GRANTED"
  | "DENIED"
  | "RESTRICTED";

export type NativeAuthResult =
  | {
      status: "ok";
      provider: "apple" | "google";
      identityToken: string;
      nonce?: string | null;
      authorizationCode?: string | null;
      email?: string | null;
      fullName?: string | null;
    }
  | { status: "cancelled" }
  | { status: "unavailable"; reason: string }
  | { status: "error"; message: string };

export type SharedPayload = {
  id: string;
  text?: string | null;
  url?: string | null;
  imageCount: number;
  stagedAt: string;
};

export type DeepLinkPayload = {
  href: string;
  receivedAt: string;
};

export type AudioCaptureResult = {
  status: "ok" | "interrupted" | "denied" | "error";
  mimeType?: string;
  base64?: string;
  durationMs?: number;
  message?: string;
};

export type ImagePickResult = {
  status: "ok" | "cancelled" | "denied" | "unavailable";
  mimeType?: string;
  base64?: string;
};

export type NativeCapability = {
  getPlatform(): Promise<NativePlatform>;
  getAppVersion(): Promise<string>;
  getBuildNumber(): Promise<string>;
  getInstallationId(): Promise<string>;
  authenticateWithApple(): Promise<NativeAuthResult>;
  authenticateWithGoogle(): Promise<NativeAuthResult>;
  requestNotificationPermission(): Promise<PermissionState>;
  getNotificationPermissionState(): Promise<PermissionState>;
  getPushToken(): Promise<string | null>;
  requestMicrophonePermission(): Promise<PermissionState>;
  getMicrophonePermissionState(): Promise<PermissionState>;
  startAudioCapture(): Promise<{ status: "ok" | "denied" | "error"; message?: string }>;
  stopAudioCapture(): Promise<AudioCaptureResult>;
  getInitialDeepLink(): Promise<DeepLinkPayload | null>;
  subscribeToDeepLinks(listener: (link: DeepLinkPayload) => void): () => void;
  getPendingSharedPayload(): Promise<SharedPayload | null>;
  clearSharedPayload(): Promise<void>;
  pickImage(): Promise<ImagePickResult>;
  captureImage(): Promise<ImagePickResult>;
  openAppSettings(): Promise<void>;
  getTimezone(): Promise<string>;
  secureGet(key: string): Promise<string | null>;
  secureSet(key: string, value: string): Promise<void>;
  secureRemove(key: string): Promise<void>;
  stageBlob(key: string, value: string): Promise<void>;
  readStaged(key: string): Promise<string | null>;
  clearStaged(key: string): Promise<void>;
};
