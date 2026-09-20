import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/server-auth";

export const RECORDINGS_BUCKET = "recordings";

export type AccountDeletionSummary = {
  ok: true;
  storageRemoved: number;
  storageFailed: number;
};

/**
 * Purges user-owned Storage objects, writes audit, then deletes auth user.
 * DB rows cascade via ON DELETE CASCADE (except account_audit → SET NULL).
 * Partial Storage failure is a hard error — we do not claim full deletion.
 */
export async function deleteUserAccountFully(
  admin: SupabaseClient,
  userId: string,
): Promise<AccountDeletionSummary> {
  const { prepareAccountDeletionHousehold } = await import("@/lib/household");
  const { disconnectCalendar } = await import("@/lib/calendar");
  await prepareAccountDeletionHousehold(admin, userId);
  await disconnectCalendar(admin, userId).catch(() => null);
  await admin.from("background_jobs").delete().eq("user_id", userId);
  await admin.from("day_plans").delete().eq("scope_type", "user").eq("scope_id", userId);
  const storage = await purgeUserRecordingObjects(admin, userId);
  if (storage.failed > 0) {
    throw new HttpError(
      503,
      "מחיקת קבצי האודיו נכשלה חלקית. החשבון לא נמחק — נסו שוב.",
    );
  }

  const { error: auditError } = await admin.from("account_audit").insert({
    user_id: userId,
    event: "account.delete_requested",
    metadata: {
      storage_removed: storage.removed,
      source: "self_service",
    },
  });
  if (auditError) {
    throw new HttpError(503, "רישום בקשת המחיקה נכשל.");
  }

  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error) {
    throw new HttpError(503, "מחיקת החשבון נכשלה.");
  }

  return {
    ok: true,
    storageRemoved: storage.removed,
    storageFailed: storage.failed,
  };
}

export async function purgeUserRecordingObjects(
  admin: SupabaseClient,
  userId: string,
): Promise<{ removed: number; failed: number; paths: string[] }> {
  const paths = new Set<string>();

  const { data: rows, error } = await admin
    .from("recordings")
    .select("storage_path")
    .eq("user_id", userId)
    .not("storage_path", "is", null);
  if (error) {
    throw new HttpError(503, "לא הצלחנו לאתר קבצי הקלטה למחיקה.");
  }
  for (const row of rows ?? []) {
    if (typeof row.storage_path === "string" && row.storage_path) {
      paths.add(row.storage_path);
    }
  }

  // Also list folder prefix in case of orphan objects without DB rows.
  const listed = await admin.storage.from(RECORDINGS_BUCKET).list(userId, {
    limit: 1000,
  });
  if (!listed.error) {
    for (const item of listed.data ?? []) {
      if (item.name) paths.add(`${userId}/${item.name}`);
    }
  }

  let removed = 0;
  let failed = 0;
  const pathList = [...paths];
  if (pathList.length === 0) {
    return { removed: 0, failed: 0, paths: [] };
  }

  // Remove in chunks of 100 (Supabase Storage limit comfort).
  for (let i = 0; i < pathList.length; i += 100) {
    const chunk = pathList.slice(i, i + 100);
    const { error: removeError } = await admin.storage
      .from(RECORDINGS_BUCKET)
      .remove(chunk);
    if (removeError) {
      failed += chunk.length;
    } else {
      removed += chunk.length;
    }
  }

  return { removed, failed, paths: pathList };
}
