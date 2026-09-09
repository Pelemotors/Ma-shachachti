import type { SupabaseClient } from "@supabase/supabase-js";
import { AppState, emptyState, migrateState, StateV2Schema } from "../model";
import { materializeDueRoutinesInPlace } from "../domain/routines";
import { ApiError } from "./errors";
import {
  cachedRevisionMatches,
  clearCachedHouseholdState,
  getCachedHouseholdState,
  putCachedHouseholdState,
} from "./state-cache";

/** Lightweight freshness check — revision only, no full AppState JSON. */
export async function readStateRevision(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("app_states")
    .select("revision")
    .eq("owner_id", userId)
    .maybeSingle();
  if (error)
    throw new ApiError(
      503,
      "לא ניתן לקרוא את המידע בענן.",
      "state_read_failed",
    );
  return Number(data?.revision ?? 0);
}

async function hydrateReminderStatuses(
  db: SupabaseClient,
  userId: string,
  state: AppState,
) {
  const { data: queue, error: queueError } = await db
    .from("reminder_queue")
    .select("id,status")
    .eq("owner_id", userId);
  if (queueError)
    throw new ApiError(
      503,
      "לא ניתן לקרוא את מצב התזכורות.",
      "reminder_read_failed",
    );
  for (const reminder of state.reminders) {
    const q = queue?.find((x) => x.id === reminder.id);
    if (q) reminder.status = q.status;
  }
}

/** Full AppState read from DB (always hits data column). */
export async function readState(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("app_states")
    .select("data,revision")
    .eq("owner_id", userId)
    .maybeSingle();
  if (error)
    throw new ApiError(
      503,
      "לא ניתן לקרוא את המידע בענן.",
      "state_read_failed",
    );
  // Dual-read: V1 is migrated in-memory to V2; never throw V2 errors at existing users.
  const state = data ? migrateState(data.data) : emptyState();
  await hydrateReminderStatuses(db, userId, state);

  // Routine occurrence IDs are deterministic by routine+local date. This makes
  // materialization safe on a read: the client and a later server write see the
  // same task identity even before the read-only occurrence is persisted.
  materializeDueRoutinesInPlace(state, new Date());

  const revision = data?.revision ?? 0;
  putCachedHouseholdState(userId, revision, state);
  return { state, revision, source: "full" as const };
}

export type LoadStateForTurnResult = {
  state: AppState;
  revision: number;
  /** Structural fetch labels for instrumentation — not semantic. */
  dbFetches: string[];
  cacheHit: boolean;
};

/**
 * Prefer cached AppState when remote revision matches.
 * Does not interpret messages; only revision equality.
 *
 * reminder_queue: delivery statuses (sent/failed) can diverge from app_states
 * without bumping revision (cron path). Hydration is required for reminder
 * fidelity on the chat path — not for agent “reasoning”, but for truthful
 * reminder status in State. Kept intentionally.
 */
export async function loadStateForTurn(
  db: SupabaseClient,
  userId: string,
): Promise<LoadStateForTurnResult> {
  const dbFetches: string[] = ["app_states.revision"];
  const revision = await readStateRevision(db, userId);
  if (cachedRevisionMatches(userId, revision)) {
    const cached = getCachedHouseholdState(userId)!;
    dbFetches.push("reminder_queue");
    await hydrateReminderStatuses(db, userId, cached.state);
    materializeDueRoutinesInPlace(cached.state, new Date());
    return {
      state: cached.state,
      revision: cached.revision,
      dbFetches,
      cacheHit: true,
    };
  }
  const full = await readState(db, userId);
  dbFetches.push("app_states.full");
  dbFetches.push("reminder_queue");
  return {
    state: full.state,
    revision: full.revision,
    dbFetches,
    cacheHit: false,
  };
}

export function rememberSavedState(
  userId: string,
  revision: number,
  state: AppState,
) {
  putCachedHouseholdState(userId, revision, state);
}

export function forgetSavedState(userId?: string) {
  clearCachedHouseholdState(userId);
}

export async function saveState(
  db: SupabaseClient,
  state: AppState,
  revision: number,
) {
  const parsed = StateV2Schema.parse(migrateState(state));
  const { data, error } = await db.rpc("save_app_state", {
    p_data: parsed,
    p_expected_revision: revision,
  });
  if (error) {
    if (error.message.includes("revision_conflict"))
      throw new ApiError(
        409,
        "המידע השתנה בחלון אחר. טענו מחדש לפני ניסיון נוסף.",
        "revision_conflict",
      );
    throw new ApiError(
      503,
      "השמירה לא הצליחה. השינוי עדיין לא נשמר.",
      "state_save_failed",
    );
  }
  return Number(data);
}

export async function jsonBody(req: Request, max = 1_000_000) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > max)
    throw new ApiError(413, "הבקשה גדולה מדי.", "payload_too_large");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "חסר תוכן.", "missing_body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new ApiError(413, "הבקשה גדולה מדי.", "payload_too_large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(all));
  } catch {
    throw new ApiError(400, "הבקשה אינה תקינה.", "invalid_json");
  }
}
