export type ScanTextChunk = {
  id: string;
  index: number;
  offset: number;
  length: number;
  text: string;
};

export const SCAN_PREFERRED_CHUNK_CHARS = 4000;
export const SCAN_MAX_CHUNKS = 40;
export const SCAN_SINGLE_PASS_CHARS = 6000;

function newChunkId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `00000000-0000-4000-8000-${String(Date.now()).padStart(12, "0").slice(-12)}`;
}

function nextBreak(text: string, start: number, chunkSize: number) {
  const hardEnd = Math.min(start + chunkSize, text.length);
  if (hardEnd >= text.length) return text.length;
  const window = text.slice(start, hardEnd);
  const para = window.lastIndexOf("\n\n");
  if (para >= Math.floor(chunkSize * 0.4)) return start + para + 2;
  const line = window.lastIndexOf("\n");
  if (line >= Math.floor(chunkSize * 0.4)) return start + line + 1;
  return hardEnd;
}

/**
 * Deterministic technical chunking. Concatenating chunk.text reconstructs
 * the original input. Does not drop a tail, score importance, or summarize.
 */
export function chunkScanText(
  text: string,
  opts?: { maxChunkChars?: number; maxChunks?: number },
): ScanTextChunk[] {
  const raw = text ?? "";
  if (!raw.length) return [];
  const maxChunks = Math.max(1, opts?.maxChunks ?? SCAN_MAX_CHUNKS);
  const preferred = opts?.maxChunkChars ?? SCAN_PREFERRED_CHUNK_CHARS;
  const chunkSize = Math.max(preferred, Math.ceil(raw.length / maxChunks));

  const chunks: ScanTextChunk[] = [];
  let offset = 0;
  let index = 0;
  while (offset < raw.length) {
    const end = nextBreak(raw, offset, chunkSize);
    const part = raw.slice(offset, end);
    chunks.push({
      id: newChunkId(),
      index,
      offset,
      length: part.length,
      text: part,
    });
    offset = end;
    index += 1;
  }
  return chunks;
}

export function joinScanChunks(chunks: ScanTextChunk[]) {
  return chunks.map((chunk) => chunk.text).join("");
}

export function scanChunksCoverInput(text: string, chunks: ScanTextChunk[]) {
  return joinScanChunks(chunks) === text;
}
