import type { SupabaseClient } from "@supabase/supabase-js";
import { decideIdentityLink } from "./identity.ts";
import {
  appleAudiencesFromEnv,
  googleAudiencesFromEnv,
  verifyAppleIdentityToken,
  verifyGoogleIdentityToken,
  type VerifiedProviderToken,
} from "./verify-jwt.ts";

export async function verifyNativeProvider(input: {
  provider: "apple" | "google";
  identityToken: string;
  nonce?: string | null;
}): Promise<VerifiedProviderToken> {
  if (input.provider === "apple") {
    return verifyAppleIdentityToken({
      token: input.identityToken,
      audience: appleAudiencesFromEnv(),
      nonce: input.nonce,
    });
  }
  return verifyGoogleIdentityToken({
    token: input.identityToken,
    audience: googleAudiencesFromEnv(),
  });
}

export async function upsertIdentityAndSession(input: {
  admin: SupabaseClient;
  verified: VerifiedProviderToken;
  authenticatedUserId: string | null;
  fullName?: string | null;
}) {
  if (!input.verified.subject) {
    throw new Error("missing_subject");
  }
  const { data: existing } = await input.admin
    .from("user_identities")
    .select("user_id,provider,provider_subject")
    .eq("provider", input.verified.provider)
    .eq("provider_subject", input.verified.subject)
    .maybeSingle();

  const decision = decideIdentityLink({
    provider: input.verified.provider,
    providerSubject: input.verified.subject,
    existingBySubject: existing
      ? {
          userId: existing.user_id as string,
          provider: existing.provider as "apple" | "google" | "email",
          providerSubject: existing.provider_subject as string,
        }
      : null,
    authenticatedUserId: input.authenticatedUserId,
  });
  if (decision.action === "reject_takeover") {
    return { ok: false as const, error: decision.reason, status: 409 };
  }

  let userId = decision.action === "create" ? null : decision.userId;
  if (decision.action === "create") {
    const email =
      input.verified.email ??
      `${input.verified.provider}-${input.verified.subject}@users.noreply.mashachachti.invalid`;
    const created = await input.admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: input.fullName ? { full_name: input.fullName } : undefined,
    });
    if (created.error || !created.data.user) {
      return {
        ok: false as const,
        error: "לא הצלחנו ליצור משתמש.",
        status: 503,
      };
    }
    userId = created.data.user.id;
  }

  if (!userId) {
    return { ok: false as const, error: "חסר משתמש.", status: 500 };
  }

  if (decision.action === "link" || decision.action === "create") {
    const { error } = await input.admin.from("user_identities").insert({
      user_id: userId,
      provider: input.verified.provider,
      provider_subject: input.verified.subject,
      email_hint: input.verified.email,
      updated_at: new Date().toISOString(),
    });
    if (error && !String(error.message).includes("duplicate")) {
      return { ok: false as const, error: "שיוך הזהות נכשל.", status: 503 };
    }
  }

  const { data: access } = await input.admin
    .from("user_roles")
    .select("approved")
    .eq("user_id", userId)
    .maybeSingle();
  if (!access?.approved) {
    return {
      ok: false as const,
      error: "החשבון עדיין ממתין לאישור.",
      status: 403,
    };
  }

  const { data: userData } = await input.admin.auth.admin.getUserById(userId);
  const email = userData.user?.email;
  if (!email) {
    return { ok: false as const, error: "חסרה כתובת למשתמש.", status: 503 };
  }
  const link = await input.admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const hashed = link.data?.properties?.hashed_token;
  if (link.error || !hashed) {
    return { ok: false as const, error: "יצירת סשן נכשלה.", status: 503 };
  }
  return {
    ok: true as const,
    userId,
    hashedToken: hashed,
    action: decision.action,
  };
}
