export function normalizeExactText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export type ExactTaskFields = {
  title: string;
  notes?: string | null;
  due_on?: string | null;
  due_at?: string | null;
  status?: string;
};

export function exactTaskFields(fields: ExactTaskFields) {
  return {
    title: normalizeExactText(fields.title),
    notes: normalizeExactText(fields.notes ?? ""),
    due_on: fields.due_on ?? null,
    due_at: fields.due_at ?? null,
  };
}

function sameInstant(left: string | null, right: string | null) {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (Number.isNaN(a) || Number.isNaN(b)) return left === right;
  return a === b;
}

export function isExactOpenDuplicate(
  existing: ExactTaskFields,
  incoming: ExactTaskFields,
) {
  if ((existing.status ?? "open") !== "open") return false;
  const left = exactTaskFields(existing);
  const right = exactTaskFields(incoming);
  return (
    left.title === right.title &&
    left.notes === right.notes &&
    left.due_on === right.due_on &&
    sameInstant(left.due_at, right.due_at)
  );
}
