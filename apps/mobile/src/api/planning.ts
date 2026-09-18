import { apiRequest } from "./client";

export async function getHealthProbe() {
  return apiRequest("/api/mobile/version");
}
