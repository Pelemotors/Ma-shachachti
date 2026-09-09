import { AppState, emptyState, migrateState } from "../model";
import { materializeDueRoutinesInPlace } from "../domain/routines";

export const LOCAL_STATE_KEY = "ma-shachachti:local:v1";

export function fingerprintState(state: AppState): string {
  return JSON.stringify(state);
}

/**
 * Compare logical state after migrate — not the raw localStorage string.
 * Raw JSON !== JSON.stringify(migrateState(parse(raw))) after schema upgrades.
 */
export function localStoredConflictsWith(
  storedRaw: string | null,
  current: AppState,
): boolean {
  if (!storedRaw) return false;
  try {
    const storedState = migrateState(JSON.parse(storedRaw));
    return fingerprintState(storedState) !== fingerprintState(current);
  } catch {
    return true;
  }
}

export function persistLocalState(state: AppState): void {
  localStorage.setItem(LOCAL_STATE_KEY, fingerprintState(state));
}

/** Load + migrate + materialize routines + rewrite so the next CAS stays stable. */
export function loadAndReconcileLocalState(): AppState {
  const raw = localStorage.getItem(LOCAL_STATE_KEY);
  const state = raw ? migrateState(JSON.parse(raw)) : emptyState();
  materializeDueRoutinesInPlace(state, new Date());
  persistLocalState(state);
  return state;
}
