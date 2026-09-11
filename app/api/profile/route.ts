import { authorize, HttpError } from "@/lib/server-auth";
import {
  emptyUserProfile,
  onboardingUpdateSchema,
  profileUpdateSchema,
  type UserProfile,
} from "@/lib/user-profile";

export const runtime = "nodejs";

const PROFILE_COLUMNS =
  "user_id,display_name,address_style,onboarding_completed_at,appearance_mode,appearance_season,created_at,updated_at";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Lean profile API error");
  return Response.json({ error: "לא הצלחנו לעדכן את הפרופיל." }, { status: 500 });
}

async function readProfile(
  db: Awaited<ReturnType<typeof authorize>>["db"],
  userId: string,
) {
  const { data, error } = await db
    .from("user_profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as UserProfile | null) ?? emptyUserProfile(userId);
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    return Response.json({ profile: await readProfile(db, userId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const parsed = profileUpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "פרופיל לא תקין.");
    }
    const { data, error } = await db
      .from("user_profiles")
      .upsert(
        {
          user_id: userId,
          ...parsed.data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select(PROFILE_COLUMNS)
      .single();
    if (error || !data) throw error ?? new Error("profile_missing");
    return Response.json({ profile: data as UserProfile });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const parsed = onboardingUpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "פרטים לא תקינים.");
    }
    const existing = await readProfile(db, userId);
    const now = new Date().toISOString();
    const appearanceMode = parsed.data.appearance_mode ?? existing.appearance_mode;
    const appearanceSeason =
      appearanceMode === "auto"
        ? null
        : (parsed.data.appearance_season ?? existing.appearance_season);
    if (appearanceMode === "season" && appearanceSeason === null) {
      throw new HttpError(400, "יש לבחור עונה.");
    }
    const { data, error } = await db
      .from("user_profiles")
      .upsert(
        {
          user_id: userId,
          display_name:
            parsed.data.display_name === undefined
              ? existing.display_name
              : parsed.data.display_name,
          address_style: parsed.data.address_style ?? existing.address_style,
          appearance_mode: appearanceMode,
          appearance_season: appearanceSeason,
          onboarding_completed_at: existing.onboarding_completed_at ?? now,
          updated_at: now,
        },
        { onConflict: "user_id" },
      )
      .select(PROFILE_COLUMNS)
      .single();
    if (error || !data) throw error ?? new Error("profile_missing");
    return Response.json({ profile: data as UserProfile });
  } catch (error) {
    return jsonError(error);
  }
}
