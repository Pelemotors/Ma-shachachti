import { apiRequest } from "./client";

export type MobileProfile = {
  user_id: string;
  display_name: string | null;
  phone_e164?: string | null;
  avatar_path?: string | null;
  /** Signed or OAuth URL for display — never persist into task rows. */
  avatar_url?: string | null;
  household_context?: HouseholdContext;
};

export type HouseholdContext = {
  adults: number;
  children: number;
  babies: number;
  rooms: number;
  bathrooms: number;
  floors: number;
  features: string[];
  pets: string[];
  free_text: string;
};

export async function getProfile() {
  return apiRequest<{ profile: MobileProfile }>("/api/profile");
}

export async function updateProfile(patch: {
  display_name?: string;
  household_context?: Partial<HouseholdContext>;
}) {
  return apiRequest<{ profile: MobileProfile }>("/api/profile", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function uploadAvatar(input: {
  base64: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
}) {
  return apiRequest<{ profile: MobileProfile }>("/api/profile/avatar", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
