import { apiRequest } from "./client";

export async function listShopping() {
  return apiRequest("/api/shopping");
}
