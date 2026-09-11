import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ADDRESS_STYLES = ["neutral", "masculine", "feminine"] as const;
export const APPEARANCE_SEASONS = [
  "spring",
  "summer",
  "autumn",
  "winter",
] as const;

export type UserProfile = {
  user_id: string;
  display_name: string | null;
  address_style: (typeof ADDRESS_STYLES)[number];
  onboarding_completed_at: string | null;
  appearance_mode: "auto" | "season";
  appearance_season: (typeof APPEARANCE_SEASONS)[number] | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AgentProfileContext = Pick<
  UserProfile,
  "display_name" | "address_style"
>;

export type LegacyProfileExtraction = {
  user_id: string | null;
  display_name: string | null;
  address_style: UserProfile["address_style"];
  onboarding_completed: boolean;
  appearance_mode: UserProfile["appearance_mode"];
  appearance_season: UserProfile["appearance_season"];
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function extractLegacyProfile(row: unknown): LegacyProfileExtraction {
  const state = objectValue(row);
  const data = objectValue(state?.data);
  const profile = objectValue(data?.profile);
  const rawName = typeof profile?.name === "string" ? profile.name.trim() : "";
  const displayName =
    rawName.length >= 1 && rawName.length <= 80 ? rawName : null;
  const rawAddress = profile?.addressAs;
  const addressStyle: UserProfile["address_style"] =
    rawAddress === "feminine" || rawAddress === "female" || rawAddress === "נקבה"
      ? "feminine"
      : rawAddress === "masculine" || rawAddress === "male" || rawAddress === "זכר"
        ? "masculine"
        : "neutral";
  const fixedTheme =
    typeof profile?.fixedTheme === "string" &&
    APPEARANCE_SEASONS.includes(
      profile.fixedTheme as (typeof APPEARANCE_SEASONS)[number],
    )
      ? (profile.fixedTheme as (typeof APPEARANCE_SEASONS)[number])
      : null;
  const fixed = profile?.themeMode === "fixed" && fixedTheme !== null;
  return {
    user_id: typeof state?.owner_id === "string" ? state.owner_id : null,
    display_name: displayName,
    address_style: addressStyle,
    onboarding_completed: profile?.onboarded === true,
    appearance_mode: fixed ? "season" : "auto",
    appearance_season: fixed ? fixedTheme : null,
  };
}

const profileFields = {
  display_name: z.string().trim().min(1).max(80).nullable(),
  address_style: z.enum(ADDRESS_STYLES),
  appearance_mode: z.enum(["auto", "season"]),
  appearance_season: z.enum(APPEARANCE_SEASONS).nullable(),
};

export const profileUpdateSchema = z
  .object(profileFields)
  .strict()
  .refine(
    (value) =>
      value.appearance_mode === "season"
        ? value.appearance_season !== null
        : value.appearance_season === null,
    { message: "בחירת המראה אינה תקינה." },
  );

export const onboardingUpdateSchema = z
  .object({
    action: z.enum(["complete", "skip"]),
    display_name: profileFields.display_name.optional(),
    address_style: profileFields.address_style.optional(),
    appearance_mode: profileFields.appearance_mode.optional(),
    appearance_season: profileFields.appearance_season.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.appearance_mode !== "season" ||
      value.appearance_season !== null,
    { message: "בחירת המראה אינה תקינה." },
  );

export function emptyUserProfile(userId: string): UserProfile {
  return {
    user_id: userId,
    display_name: null,
    address_style: "neutral",
    onboarding_completed_at: null,
    appearance_mode: "auto",
    appearance_season: null,
    created_at: null,
    updated_at: null,
  };
}

export async function loadAgentProfile(
  db: SupabaseClient,
  userId: string,
): Promise<AgentProfileContext> {
  const { data, error } = await db
    .from("user_profiles")
    .select("display_name,address_style")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { display_name: null, address_style: "neutral" };
  return {
    display_name:
      typeof data.display_name === "string" ? data.display_name : null,
    address_style: ADDRESS_STYLES.includes(data.address_style)
      ? data.address_style
      : "neutral",
  };
}
