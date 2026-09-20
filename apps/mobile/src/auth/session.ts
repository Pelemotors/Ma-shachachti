import { exchangeNativeIdentity } from "../api/auth";
import {
  clearSessionMarkers,
  getSupabase,
  persistSessionMarkers,
} from "../api/supabase";
import {
  getNativeIdentityProvider,
} from "./nativeIdentity";
import type { NativeAuthProvider } from "../api/auth";
import type { Session, User } from "@supabase/supabase-js";

export type AuthUser = {
  id: string;
  email: string | null;
  displayName: string | null;
};

export async function restoreSession(): Promise<{
  session: Session | null;
  user: AuthUser | null;
}> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) {
    await clearSessionMarkers();
    return { session: null, user: null };
  }
  await persistSessionMarkers(session);
  return {
    session,
    user: toAuthUser(session.user),
  };
}

export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<{ user: AuthUser }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error || !data.session) {
    throw new Error("התחברות במייל נכשלה.");
  }
  await persistSessionMarkers(data.session);
  return { user: toAuthUser(data.session.user) };
}

export async function signInWithNativeProvider(
  provider: NativeAuthProvider,
): Promise<{ user: AuthUser }> {
  const identity =
    provider === "google"
      ? await getNativeIdentityProvider().signInWithGoogle()
      : await getNativeIdentityProvider().signInWithApple();

  if (identity.status === "cancelled") {
    throw new Error("ההתחברות בוטלה.");
  }
  if (identity.status === "unavailable") {
    throw new Error(identity.reason);
  }

  const exchanged = await exchangeNativeIdentity({
    provider,
    identityToken: identity.identityToken,
    nonce: identity.nonce,
    fullName: identity.fullName,
  });

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: exchanged.hashedToken,
    type: "email",
  });
  if (error || !data.session) {
    throw new Error("לא הצלחנו להשלים התחברות.");
  }
  await persistSessionMarkers(data.session);
  return { user: toAuthUser(data.session.user) };
}

/**
 * Dev/Foundation helper: complete auth when a hashedToken is already known
 * (e.g. from a future native bridge test). Not used by product screens yet.
 */
export async function completeWithHashedToken(hashedToken: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: hashedToken,
    type: "email",
  });
  if (error || !data.session) {
    throw new Error("לא הצלחנו להשלים התחברות.");
  }
  await persistSessionMarkers(data.session);
  return { user: toAuthUser(data.session.user) };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  await supabase.auth.signOut();
  await clearSessionMarkers();
}

function toAuthUser(user: User): AuthUser {
  const meta = user.user_metadata ?? {};
  const raw =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.given_name === "string" && meta.given_name) ||
    null;
  return {
    id: user.id,
    email: user.email ?? null,
    displayName: raw,
  };
}

