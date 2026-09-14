import type { MemoryRow } from "../../types.ts";

export type MemorySelectInput = {
  memories: MemoryRow[];
  queryHint?: string | null;
  limit?: number;
};

/**
 * Pluggable personal-memory selector.
 * V1: recency + lightweight Hebrew/English token overlap + prefer user-sourced.
 * Deep Access can request a broader memory fetch when this is insufficient.
 */
export function selectPersonalMemories(input: MemorySelectInput): MemoryRow[] {
  const limit = Math.min(Math.max(input.limit ?? 6, 1), 20);
  const hint = (input.queryHint ?? "").trim().toLowerCase();
  const tokens = hint
    ? hint
        .split(/[^\p{L}\p{N}]+/u)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    : [];

  const scored = input.memories.map((memory, index) => {
    const content = memory.content.toLowerCase();
    let score = index === 0 ? 0.2 : 0;
    // Prefer fresher rows (list is typically newest-first from loadMemory).
    score += Math.max(0, 1 - index * 0.03);
    if (memory.source === "user") score += 0.35;
    if (memory.seen_at == null) score += 0.1;
    for (const token of tokens) {
      if (content.includes(token)) score += 0.45;
    }
    return { memory, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((row) => row.memory);
}
