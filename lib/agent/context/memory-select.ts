import type { MemoryRow } from "../../types.ts";
import {
  factEntityKey,
  inferMemoryCategory,
  inferMemoryScope,
  preferenceTopicKey,
} from "../../memory-display.ts";

export type MemorySelectInput = {
  memories: MemoryRow[];
  queryHint?: string | null;
  limit?: number;
  now?: Date;
};

const TEMPORARY_MAX_AGE_MS = 36 * 60 * 60 * 1000;

function isActiveTemporary(memory: MemoryRow, now: Date): boolean {
  const category = inferMemoryCategory(
    memory.content,
    memory.kind,
    memory.category,
  );
  const scope = inferMemoryScope(memory.content, category, memory.scope);
  if (scope !== "temporary" && category !== "exception") return true;
  const stamp = memory.updated_at || memory.created_at;
  if (!stamp) return true;
  const age = now.getTime() - new Date(stamp).getTime();
  if (Number.isFinite(age) && age > TEMPORARY_MAX_AGE_MS) return false;
  return true;
}

/**
 * Pluggable personal-memory selector.
 * Prefer durable over expired temporary; supersede same entity/topic; recency + overlap.
 */
export function selectPersonalMemories(input: MemorySelectInput): MemoryRow[] {
  const limit = Math.min(Math.max(input.limit ?? 6, 1), 20);
  const now = input.now ?? new Date();
  const hint = (input.queryHint ?? "").trim().toLowerCase();
  const tokens = hint
    ? hint
        .split(/[^\p{L}\p{N}]+/u)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    : [];

  const active = input.memories.filter(
    (memory) => memory.active !== false && isActiveTemporary(memory, now),
  );

  // Drop older rows when a newer row shares entity/topic (corrections win).
  const seenKeys = new Set<string>();
  const deduped: MemoryRow[] = [];
  const newestFirst = [...active].sort((a, b) =>
    String(b.updated_at ?? b.created_at).localeCompare(
      String(a.updated_at ?? a.created_at),
    ),
  );
  for (const memory of newestFirst) {
    const entity = factEntityKey(memory.content);
    const topic = preferenceTopicKey(memory.content);
    const key = entity ? `e:${entity}` : topic ? `t:${topic}` : `id:${memory.id}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push(memory);
  }

  const scored = deduped.map((memory, index) => {
    const content = memory.content.toLowerCase();
    const category = inferMemoryCategory(
      memory.content,
      memory.kind,
      memory.category,
    );
    const scope = inferMemoryScope(memory.content, category, memory.scope);
    let score = index === 0 ? 0.2 : 0;
    score += Math.max(0, 1 - index * 0.03);
    if (memory.source === "user") score += 0.35;
    if (memory.seen_at == null) score += 0.1;
    if (scope === "always") score += 0.25;
    if (scope === "temporary") score -= 0.15;
    for (const token of tokens) {
      if (content.includes(token)) score += 0.45;
    }
    return { memory, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((row) => row.memory);
}
