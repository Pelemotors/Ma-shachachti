import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { nativeCapability } from "@/lib/native";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

class NativeSecureStorage {
  async getItem(keyName: string) {
    return nativeCapability().secureGet(keyName);
  }
  async setItem(keyName: string, value: string) {
    await nativeCapability().secureSet(keyName, value);
  }
  async removeItem(keyName: string) {
    await nativeCapability().secureRemove(keyName);
  }
}

function isNativeShell() {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.(),
  );
}

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storage: isNativeShell() ? new NativeSecureStorage() : undefined,
        },
      })
    : null;

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const session = (await supabase?.auth.getSession())?.data.session;
  const headers = new Headers(init.headers);
  headers.set("Authorization", session ? `Bearer ${session.access_token}` : "");
  return fetch(input, { ...init, headers });
}
