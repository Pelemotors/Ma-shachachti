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

const TASK_STOPWORDS = new Set([
  "ל",
  "את",
  "של",
  "עם",
  "על",
  "עד",
  "ב",
  "ה",
  "ו",
  "מה",
  "כבר",
  "צריך",
  "גם",
  "רק",
  "תזכורת",
  "לקנות",
  "להזמין",
  "הזמנתי",
  "קניתי",
  "לקחת",
  "לקחתי",
  "להתקשר",
  "דיברתי",
  "לסמן",
  "סיימתי",
  "עשיתי",
  "טיפלתי",
]);

const COMPLETION_RE =
  /הזמנתי|קניתי|לקחתי|דיברתי|סיימתי|עשיתי|טיפלתי|סגרתי|כבר\s/;
const CANCEL_RE = /ביטלתי|לא צריך|תבטלי|תבטל|לבטל/;

export function isCompletionUtterance(text: string | null | undefined) {
  return Boolean(text && COMPLETION_RE.test(text));
}

export function isCancelUtterance(text: string | null | undefined) {
  return Boolean(text && CANCEL_RE.test(text));
}

function stripHebrewParticle(token: string) {
  let next = token;
  if (next.startsWith("מה") && next.length > 3) next = next.slice(2);
  if (next.length > 2 && (next.startsWith("ה") || next.startsWith("ל") || next.startsWith("ב") || next.startsWith("ו"))) {
    next = next.slice(1);
  }
  if (next.endsWith("ים") && next.length > 4) next = next.slice(0, -2);
  if (next.endsWith("ות") && next.length > 4) next = next.slice(0, -2);
  if (next.endsWith("י") && next.length > 3) next = next.slice(0, -1);
  return next;
}

export function significantTaskTokens(title: string) {
  return normalizeExactText(title)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !TASK_STOPWORDS.has(token))
    .map(stripHebrewParticle)
    .filter((token) => token.length >= 2 && !TASK_STOPWORDS.has(token));
}

function tokensOverlap(left: string, right: string) {
  return (
    left === right ||
    (left.length >= 3 && right.includes(left)) ||
    (right.length >= 3 && left.includes(right))
  );
}

export function isSameTaskEntity(existingTitle: string, incomingTitle: string) {
  const left = significantTaskTokens(existingTitle);
  const right = significantTaskTokens(incomingTitle);
  if (!left.length || !right.length) return false;
  const overlap = left.filter((token) => right.some((other) => tokensOverlap(token, other)));
  if (overlap.length >= 2) return true;
  const extraLeft = left.filter((token) => !right.some((other) => tokensOverlap(token, other)));
  const extraRight = right.filter((token) => !left.some((other) => tokensOverlap(token, other)));
  return overlap.length === 1 && extraLeft.length === 0 && extraRight.length === 0;
}

/** Completion/cancel mentions may be a subset of the open entity ("החבילה" → חבילה מהלוקר). */
export function isRelatedTaskMention(
  existingTitle: string,
  incomingTitle: string,
  opts: { completion?: boolean } = {},
) {
  if (isSameTaskEntity(existingTitle, incomingTitle)) return true;
  if (!opts.completion) return false;
  const left = significantTaskTokens(existingTitle);
  const right = significantTaskTokens(incomingTitle);
  if (!right.length) return false;
  return right.every((token) => left.some((other) => tokensOverlap(token, other)));
}

export function findRelatedOpenTasks<T extends { title: string; status?: string }>(
  tasks: T[],
  title: string,
  opts: { completion?: boolean } = {},
) {
  return tasks.filter(
    (task) =>
      (task.status ?? "open") === "open" &&
      isRelatedTaskMention(task.title, title, opts),
  );
}

export function findRelatedOpenTask<T extends { title: string; status?: string }>(
  tasks: T[],
  title: string,
  opts: { completion?: boolean } = {},
) {
  return findRelatedOpenTasks(tasks, title, opts)[0] ?? null;
}
