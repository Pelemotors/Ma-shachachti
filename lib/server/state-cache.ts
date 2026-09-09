/**
 * Process-local AppState cache keyed by owner + revision.
 * Cache answers "where is the data / did it change?" — never "what does the user mean?".
 */
import type { AppState } from "@/lib/model";

export type CachedHouseholdState = {
  ownerId: string;
  revision: number;
  state: AppState;
  updatedAt: string;
};

const byOwner = new Map<string, CachedHouseholdState>();

export function getCachedHouseholdState(
  ownerId: string,
): CachedHouseholdState | null {
  return byOwner.get(ownerId) ?? null;
}

export function putCachedHouseholdState(
  ownerId: string,
  revision: number,
  state: AppState,
) {
  byOwner.set(ownerId, {
    ownerId,
    revision,
    state,
    updatedAt: new Date().toISOString(),
  });
}

export function clearCachedHouseholdState(ownerId?: string) {
  if (ownerId) byOwner.delete(ownerId);
  else byOwner.clear();
}

export function cachedRevisionMatches(ownerId: string, revision: number) {
  const hit = byOwner.get(ownerId);
  return Boolean(hit && hit.revision === revision);
}
