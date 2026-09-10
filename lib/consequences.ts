import type { SupabaseClient } from "@supabase/supabase-js";
import { UUID_RE } from "./action-schema.ts";
import { DATE_RE } from "./time.ts";
import {
  CONSEQUENCE_BASIS_KINDS,
  CONSEQUENCE_CONFIDENCES,
  CONSEQUENCE_SEVERITIES,
  type ConsequenceRow,
  type ConsequenceUpdate,
} from "./types.ts";

export function isConsequenceSeverity(
  value: unknown,
): value is ConsequenceUpdate["severity"] {
  return (
    typeof value === "string" &&
    (CONSEQUENCE_SEVERITIES as readonly string[]).includes(value)
  );
}

export function parseConsequenceUpdates(raw: unknown): ConsequenceUpdate[] {
  if (!Array.isArray(raw)) return [];
  const accepted: ConsequenceUpdate[] = [];
  for (const item of raw.slice(0, 20)) {
    const parsed = parseConsequenceUpdate(item);
    if (parsed) accepted.push(parsed);
  }
  return accepted;
}

export function parseConsequenceUpdate(
  raw: unknown,
): ConsequenceUpdate | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.task_id !== "string" || !UUID_RE.test(item.task_id)) return null;
  if (!isConsequenceSeverity(item.severity)) return null;
  if (
    typeof item.confidence !== "string" ||
    !(CONSEQUENCE_CONFIDENCES as readonly string[]).includes(item.confidence)
  ) {
    return null;
  }
  const reason = typeof item.reason === "string" ? item.reason.trim() : "";
  if (!reason || reason.length > 280) return null;
  const basisRaw = item.basis;
  const kind =
    basisRaw &&
    typeof basisRaw === "object" &&
    !Array.isArray(basisRaw) &&
    typeof (basisRaw as { kind?: unknown }).kind === "string"
      ? (basisRaw as { kind: string }).kind
      : null;
  if (!kind || !(CONSEQUENCE_BASIS_KINDS as readonly string[]).includes(kind)) {
    return null;
  }
  const validUntil =
    item.valid_until == null || item.valid_until === ""
      ? null
      : typeof item.valid_until === "string" && DATE_RE.test(item.valid_until)
        ? item.valid_until
        : undefined;
  if (validUntil === undefined) return null;
  return {
    task_id: item.task_id,
    severity: item.severity,
    reason,
    confidence: item.confidence as ConsequenceUpdate["confidence"],
    basis: { kind: kind as ConsequenceUpdate["basis"]["kind"] },
    valid_until: validUntil,
  };
}

export async function loadConsequences(
  db: SupabaseClient,
  userId: string,
  taskIds: string[],
) {
  if (!taskIds.length) return new Map<string, ConsequenceRow>();
  try {
    const { data, error } = await db
      .from("task_consequences")
      .select(
        "task_id,user_id,severity,reason,confidence,basis,valid_until,created_at,updated_at",
      )
      .eq("user_id", userId)
      .in("task_id", taskIds);
    if (error) return new Map<string, ConsequenceRow>();
    return new Map(
      ((data ?? []) as ConsequenceRow[]).map((row) => [row.task_id, row]),
    );
  } catch {
    return new Map<string, ConsequenceRow>();
  }
}

export async function persistConsequenceUpdates(
  db: SupabaseClient,
  userId: string,
  updates: unknown,
) {
  let accepted: ConsequenceUpdate[] = [];
  try {
    accepted = parseConsequenceUpdates(updates);
  } catch {
    return;
  }
  for (const update of accepted) {
    try {
      const { data: task } = await db
        .from("tasks")
        .select("id")
        .eq("user_id", userId)
        .eq("id", update.task_id)
        .maybeSingle();
      if (!task) continue;
      const now = new Date().toISOString();
      const { error } = await db.from("task_consequences").upsert(
        {
          task_id: update.task_id,
          user_id: userId,
          severity: update.severity,
          reason: update.reason,
          confidence: update.confidence,
          basis: update.basis,
          valid_until: update.valid_until,
          updated_at: now,
        },
        { onConflict: "task_id" },
      );
      if (error) {
        console.error("Lean consequence upsert failed");
      }
    } catch {
      /* enrichment must not fail the turn */
    }
  }
}
