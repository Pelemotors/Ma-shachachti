import { apiRequest } from "./client";

export type NativeAuthProvider = "apple" | "google";

export type NativeAuthResponse = {
  ok: true;
  userId: string;
  action: string;
  hashedToken: string;
};

/**
 * Exchange Apple/Google identity token for a Supabase hashed magic-link token.
 * Same Backend endpoint used by the Capacitor shell — no separate mobile auth DB.
 */
export async function exchangeNativeIdentity(input: {
  provider: NativeAuthProvider;
  identityToken: string;
  nonce?: string | null;
  fullName?: string | null;
}): Promise<NativeAuthResponse> {
  return apiRequest<NativeAuthResponse>("/api/auth/native", {
    method: "POST",
    anonymous: true,
    body: JSON.stringify({
      provider: input.provider,
      identityToken: input.identityToken,
      nonce: input.nonce ?? null,
      fullName: input.fullName ?? null,
    }),
  });
}
