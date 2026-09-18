import * as SecureStore from "expo-secure-store";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const SESSION_KEYS = {
  accessToken: "mashachachti.access_token",
  refreshToken: "mashachachti.refresh_token",
  userId: "mashachachti.user_id",
} as const;

export async function secureGet(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key, OPTIONS);
}

export async function secureSet(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, OPTIONS);
}

export async function secureRemove(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key, OPTIONS);
}

export async function clearSecureSession(): Promise<void> {
  await Promise.all([
    secureRemove(SESSION_KEYS.accessToken),
    secureRemove(SESSION_KEYS.refreshToken),
    secureRemove(SESSION_KEYS.userId),
  ]);
}
