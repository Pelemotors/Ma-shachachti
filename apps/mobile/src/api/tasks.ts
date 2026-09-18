/**
 * Placeholder modules for future domain APIs.
 * Screens must import from here (or sibling api modules), never fetch() directly.
 */

import { apiRequest } from "./client";

export async function getMobileVersion() {
  return apiRequest<{ version?: string; min?: string }>("/api/mobile/version");
}
