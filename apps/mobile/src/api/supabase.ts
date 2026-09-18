import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "../utils/env";
import {
  SESSION_KEYS,
  secureGet,
  secureRemove,
  secureSet,
} from "../storage/secureSession";

const ExpoSecureStorage = {
  getItem: (key: string) => secureGet(key),
  setItem: (key: string, value: string) => secureSet(key, value),
  removeItem: (key: string) => secureRemove(key),
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Supabase URL/anon key missing for Mobile auth.");
  }
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: ExpoSecureStorage,
      flowType: "pkce",
    },
  });
  return client;
}

export async function persistSessionMarkers(session: Session): Promise<void> {
  await secureSet(SESSION_KEYS.accessToken, session.access_token);
  await secureSet(SESSION_KEYS.refreshToken, session.refresh_token);
  await secureSet(SESSION_KEYS.userId, session.user.id);
}

export async function clearSessionMarkers(): Promise<void> {
  await secureRemove(SESSION_KEYS.accessToken);
  await secureRemove(SESSION_KEYS.refreshToken);
  await secureRemove(SESSION_KEYS.userId);
}

export async function readStoredAccessToken(): Promise<string | null> {
  return secureGet(SESSION_KEYS.accessToken);
}
