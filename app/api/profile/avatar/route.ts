import { authorize, HttpError } from "@/lib/server-auth";
import { emptyUserProfile, type UserProfile } from "@/lib/user-profile";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PROFILE_COLUMNS =
  "user_id,display_name,phone_e164,address_style,onboarding_completed_at,appearance_mode,appearance_season,avatar_path,created_at,updated_at";

type Body = {
  base64?: string;
  contentType?: string;
};

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("avatar upload error", error);
  return Response.json({ error: "העלאת התמונה נכשלה." }, { status: 500 });
}

function extFor(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export async function POST(req: Request) {
  try {
    const { db, userId, accessToken } = await authorize(req);
    const body = (await req.json()) as Body;
    const base64 = typeof body.base64 === "string" ? body.base64 : "";
    const contentType =
      body.contentType === "image/png" || body.contentType === "image/webp"
        ? body.contentType
        : "image/jpeg";
    if (!base64 || base64.length < 32) {
      throw new HttpError(400, "תמונה חסרה.");
    }
    // ~10MB base64 ceiling
    if (base64.length > 14_000_000) {
      throw new HttpError(400, "התמונה גדולה מדי.");
    }
    const buffer = Buffer.from(base64, "base64");
    if (buffer.byteLength > 5_000_000) {
      throw new HttpError(400, "התמונה גדולה מדי אחרי עיבוד.");
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new HttpError(503, "Storage לא זמין.");

    const userDb = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const path = `${userId}/avatar.${extFor(contentType)}`;
    const { error: upErr } = await userDb.storage
      .from("avatars")
      .upload(path, buffer, { contentType, upsert: true });
    if (upErr) {
      console.error("avatar storage upload", upErr.message);
      throw new HttpError(503, "לא הצלחנו לשמור את התמונה.");
    }

    const { data, error } = await db
      .from("user_profiles")
      .upsert(
        {
          user_id: userId,
          avatar_path: path,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select(PROFILE_COLUMNS)
      .single();
    if (error || !data) throw error ?? new Error("profile_missing");

    const signed = await userDb.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    const profile = {
      ...emptyUserProfile(userId),
      ...(data as UserProfile),
      avatar_url: signed.data?.signedUrl ?? null,
    };
    return Response.json({ profile });
  } catch (error) {
    return jsonError(error);
  }
}
