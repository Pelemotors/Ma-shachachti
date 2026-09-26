import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./server-auth.ts";

/** Persistent execution of a checklist that is not tied to a routine occurrence. */
export const STANDALONE_RUN_KEY = "standalone";

export function withRunChecks<T extends { id: string }>(
  items: T[],
  checkedIds: ReadonlySet<string>,
) {
  return items.map((item) => ({ ...item, checked: checkedIds.has(item.id) }));
}

async function ensureRun(
  db: SupabaseClient,
  userId: string,
  checklistId: string,
  occurrenceKey: string,
) {
  const { data: existing, error } = await db
    .from("checklist_runs")
    .select("id")
    .eq("user_id", userId)
    .eq("checklist_id", checklistId)
    .eq("occurrence_key", occurrenceKey)
    .maybeSingle();
  if (error) throw new HttpError(503, "לא הצלחנו לטעון את ביצוע הרשימה.");
  if (existing?.id) return String(existing.id);
  const { data, error: insertError } = await db
    .from("checklist_runs")
    .insert({
      user_id: userId,
      checklist_id: checklistId,
      occurrence_key: occurrenceKey,
    })
    .select("id")
    .single();
  if (insertError || !data) throw new HttpError(503, "לא הצלחנו לפתוח ביצוע לרשימה.");
  return String(data.id);
}

export async function loadRunChecks(
  db: SupabaseClient,
  userId: string,
  checklistIds: string[],
  occurrenceKey: string,
) {
  const checks = new Map<string, Set<string>>();
  if (!checklistIds.length) return checks;
  const { data: runs, error } = await db
    .from("checklist_runs")
    .select("id,checklist_id")
    .eq("user_id", userId)
    .eq("occurrence_key", occurrenceKey)
    .in("checklist_id", checklistIds);
  if (error) throw new HttpError(503, "לא הצלחנו לטעון ביצועי רשימות.");
  const runToList = new Map<string, string>();
  for (const run of runs ?? []) runToList.set(String(run.id), String(run.checklist_id));
  if (!runToList.size) return checks;
  const { data: rows, error: itemError } = await db
    .from("checklist_run_items")
    .select("run_id,template_item_id,checked")
    .in("run_id", [...runToList.keys()]);
  if (itemError) throw new HttpError(503, "לא הצלחנו לטעון סימוני רשימה.");
  for (const row of rows ?? []) {
    if (!row.checked) continue;
    const listId = runToList.get(String(row.run_id));
    if (!listId) continue;
    const set = checks.get(listId) ?? new Set<string>();
    set.add(String(row.template_item_id));
    checks.set(listId, set);
  }
  return checks;
}

export async function setChecklistRunItem(
  db: SupabaseClient,
  userId: string,
  checklistId: string,
  templateItemId: string,
  checked: boolean,
  occurrenceKey = STANDALONE_RUN_KEY,
) {
  const runId = await ensureRun(db, userId, checklistId, occurrenceKey);
  const { error } = await db.from("checklist_run_items").upsert(
    { run_id: runId, template_item_id: templateItemId, checked },
    { onConflict: "run_id,template_item_id" },
  );
  if (error) throw new HttpError(503, "לא הצלחנו לעדכן את הסימון.");
}

export async function resetChecklistRun(
  db: SupabaseClient,
  userId: string,
  checklistId: string,
  occurrenceKey = STANDALONE_RUN_KEY,
) {
  const { data: run, error } = await db
    .from("checklist_runs")
    .select("id")
    .eq("user_id", userId)
    .eq("checklist_id", checklistId)
    .eq("occurrence_key", occurrenceKey)
    .maybeSingle();
  if (error) throw new HttpError(503, "לא הצלחנו לאפס את הרשימה.");
  if (!run?.id) return;
  const { error: clearError } = await db
    .from("checklist_run_items")
    .delete()
    .eq("run_id", run.id);
  if (clearError) throw new HttpError(503, "לא הצלחנו לאפס את הרשימה.");
}
