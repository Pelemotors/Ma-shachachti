import Constants from "expo-constants";

type Extra = {
  mobileApiBaseUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

function extra(): Extra {
  return (Constants.expoConfig?.extra ?? {}) as Extra;
}

/** Canonical API origin for all Mobile HTTP. No hardcoded URLs in screens. */
export function getMobileApiBaseUrl(): string {
  const fromEnv = process.env.MOBILE_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const fromExtra = extra().mobileApiBaseUrl?.trim();
  if (fromExtra) return fromExtra.replace(/\/$/, "");
  throw new Error("MOBILE_API_BASE_URL is not configured.");
}

export function getSupabaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
    extra().supabaseUrl?.trim() ||
    ""
  );
}

export function getSupabaseAnonKey(): string {
  return (
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    extra().supabaseAnonKey?.trim() ||
    ""
  );
}
