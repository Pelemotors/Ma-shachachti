export type PendingMutation = {
  id: string;
  kind: "task" | "shopping" | "capture" | "audio" | "share";
  payload: unknown;
  createdAt: string;
  attempts: number;
};

const KEY = "ma-shachachti-pending-mutations";

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readPendingMutations(storage = store()): PendingMutation[] {
  const raw = storage?.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PendingMutation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueuePendingMutation(
  mutation: Omit<PendingMutation, "attempts" | "createdAt"> & {
    attempts?: number;
    createdAt?: string;
  },
  storage = store(),
) {
  const current = readPendingMutations(storage);
  if (current.some((row) => row.id === mutation.id)) return current;
  const next = [
    ...current,
    {
      ...mutation,
      attempts: mutation.attempts ?? 0,
      createdAt: mutation.createdAt ?? new Date().toISOString(),
    },
  ];
  storage?.setItem(KEY, JSON.stringify(next));
  return next;
}

export function completePendingMutation(id: string, storage = store()) {
  const next = readPendingMutations(storage).filter((row) => row.id !== id);
  storage?.setItem(KEY, JSON.stringify(next));
  return next;
}

export function bumpPendingMutation(id: string, storage = store()) {
  const next = readPendingMutations(storage).map((row) =>
    row.id === id ? { ...row, attempts: row.attempts + 1 } : row,
  );
  storage?.setItem(KEY, JSON.stringify(next));
  return next;
}
