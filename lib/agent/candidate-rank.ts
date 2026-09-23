import { productNow } from "../product-clock.ts";
import type { ConsequenceRow, TaskRow } from "../types.ts";
import { dueTimeFromDueAt, jerusalemParts, todayContext } from "../time.ts";

export type RankedCandidate = {
  task: TaskRow;
  score: number;
  reasons: string[];
};

const SEVERITY_SCORE: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 3,
  high: 6,
  critical: 10,
};

/**
 * Deterministic pre-ranking from metadata only (no title/keyword semantics).
 * Higher score = stronger candidate for attention / planning / free-time.
 */
export function scoreTaskCandidate(input: {
  task: TaskRow;
  consequence?: ConsequenceRow | null;
  now?: Date;
  freeMinutes?: number | null;
}): RankedCandidate {
  const now = input.now ?? productNow();
  const { date: today, currentTime } = todayContext(now);
  const task = input.task;
  let score = 0;
  const reasons: string[] = [];

  const severity = input.consequence?.severity ?? "none";
  const sev = SEVERITY_SCORE[severity] ?? 0;
  if (sev > 0) {
    score += sev;
    reasons.push(`consequence:${severity}`);
  }

  if (task.due_on) {
    if (task.due_on < today) {
      score += 5;
      reasons.push("overdue_date");
    } else if (task.due_on === today) {
      score += 4;
      reasons.push("due_today");
    } else {
      // Near-term undated window preference without reading the title.
      const days =
        (Date.parse(`${task.due_on}T12:00:00Z`) -
          Date.parse(`${today}T12:00:00Z`)) /
        86_400_000;
      if (days <= 2) {
        score += 2;
        reasons.push("due_soon");
      } else if (days <= 7) {
        score += 1;
        reasons.push("due_week");
      }
    }
  } else {
    // Undated open work still competes — not zeroed by recency bias.
    score += 1.5;
    reasons.push("undated_open");
  }

  const clock = dueTimeFromDueAt(task.due_at);
  if (clock && task.due_on === today) {
    if (clock < currentTime) {
      score += 3;
      reasons.push("overdue_time");
    } else {
      score += 2;
      reasons.push("timed_today");
    }
  }

  const reschedules = task.reschedule_count ?? 0;
  if (reschedules > 0) {
    score += Math.min(4, reschedules);
    reasons.push(`reschedule:${reschedules}`);
  }

  if (task.planned_start_at) {
    const planned = jerusalemParts(task.planned_start_at);
    if (planned.date === today) {
      // Already on today's plan — eligible but not preferred solely for that.
      score += 0.25;
      reasons.push("planned_today");
    }
  }

  // Mild age signal: older open items get a small boost (anti-recency bias).
  const ageMs = Math.max(0, now.getTime() - Date.parse(task.created_at));
  const ageDays = ageMs / 86_400_000;
  if (ageDays >= 14) {
    score += 1.25;
    reasons.push("aged_14d");
  } else if (ageDays >= 3) {
    score += 0.5;
    reasons.push("aged_3d");
  }

  if (input.freeMinutes != null && input.freeMinutes > 0) {
    // Without duration estimates, prefer lighter-looking notes (short) only as weak signal.
    const notesLen = (task.notes ?? "").trim().length;
    if (notesLen > 180 && input.freeMinutes <= 20) {
      score -= 1;
      reasons.push("notes_heavy_for_window");
    }
  }

  return { task, score, reasons };
}

export function rankTaskCandidates(input: {
  tasks: TaskRow[];
  consequences?: ConsequenceRow[];
  now?: Date;
  freeMinutes?: number | null;
  limit?: number;
}): RankedCandidate[] {
  const byId = new Map(
    (input.consequences ?? []).map((row) => [row.task_id, row]),
  );
  const ranked = input.tasks
    .filter((task) => task.status === "open")
    .map((task) =>
      scoreTaskCandidate({
        task,
        consequence: byId.get(task.id) ?? null,
        now: input.now,
        freeMinutes: input.freeMinutes,
      }),
    );
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable tie-break: older first, then id.
    const age = a.task.created_at.localeCompare(b.task.created_at);
    if (age !== 0) return age;
    return a.task.id.localeCompare(b.task.id);
  });
  const limit = input.limit ?? ranked.length;
  return ranked.slice(0, Math.max(0, limit));
}

/**
 * Forgotten post-validation: keep target count, drop dupes/invalids,
 * and avoid routine-only domination when higher-scored candidates exist.
 */
export function stabilizeForgottenSelection(input: {
  selectedIds: string[];
  ranked: RankedCandidate[];
  targetMin?: number;
  targetMax?: number;
}): string[] {
  const targetMin = input.targetMin ?? 5;
  const targetMax = input.targetMax ?? 6;
  const byId = new Map(input.ranked.map((row) => [row.task.id, row]));
  const seen = new Set<string>();
  const selected: string[] = [];

  for (const id of input.selectedIds) {
    if (selected.length >= targetMax) break;
    if (seen.has(id)) continue;
    if (!byId.has(id)) continue;
    seen.add(id);
    selected.push(id);
  }

  // Top-up from deterministic ranking if LLM under-selected.
  if (selected.length < targetMin) {
    for (const row of input.ranked) {
      if (selected.length >= targetMin) break;
      if (seen.has(row.task.id)) continue;
      seen.add(row.task.id);
      selected.push(row.task.id);
    }
  }

  // If over-selected beyond max, keep highest ranked among chosen.
  if (selected.length > targetMax) {
    selected.sort((a, b) => {
      const sa = byId.get(a)?.score ?? 0;
      const sb = byId.get(b)?.score ?? 0;
      return sb - sa;
    });
    return selected.slice(0, targetMax);
  }

  return selected;
}

/** Format ranking metadata into compact context lines (for the planner). */
export function formatCandidateMeta(row: RankedCandidate): string {
  return `score=${row.score.toFixed(2)} reasons=${row.reasons.join(",")}`;
}
