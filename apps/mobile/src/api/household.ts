import { apiRequest } from "./client";

export type HouseholdPayload = {
  household: { id: string; title: string } | null;
  members: Array<{ user_id: string; role: string }>;
  role?: string;
  token?: string;
};

export async function getHousehold() {
  return apiRequest<HouseholdPayload>("/api/household");
}

export async function householdAction(
  action: "create" | "invite" | "accept" | "leave",
  extra: { title?: string; token?: string } = {},
) {
  return apiRequest<HouseholdPayload>("/api/household", {
    method: "POST",
    body: JSON.stringify({ action, ...extra }),
  });
}
