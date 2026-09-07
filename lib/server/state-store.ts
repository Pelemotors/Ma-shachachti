import type { SupabaseClient } from "@supabase/supabase-js";
import { AppState, emptyState, migrateState, StateV2Schema } from "../model";
import { ApiError } from "./errors";

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
  // Dual-read: V1 is migrated in-memory to V2; never throw Zod V2 errors at existing users.
  const state = data ? migrateState(data.data) : emptyState();
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
  return { state, revision: data?.revision ?? 0 };
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
