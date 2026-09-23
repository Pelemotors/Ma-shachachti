export const FREETIME_DEFAULT_MINUTES = 30;

export function homeSendResult(ok: boolean) {
  return ok
    ? { navigateToChat: true, clearDraft: true, showError: false }
    : { navigateToChat: false, clearDraft: false, showError: true };
}

export function chatSendResult(ok: boolean) {
  return ok
    ? { keepOptimistic: false, appendCanonical: true, clearDraft: true, showError: false }
    : { keepOptimistic: false, appendCanonical: false, clearDraft: false, showError: true };
}

export function newChatTurnId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function claimSendLock(lock: { current: boolean }) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function reconcileChatThread<T extends { id: string }>(incoming: T[]): T[] {
  const seen = new Set<string>();
  const next: T[] = [];
  for (const message of incoming) {
    const id = message.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(message);
  }
  return next;
}

export function shoppingAddResult(ok: boolean, draft: string) {
  return ok
    ? { nextDraft: "", acceptList: true, showError: false }
    : { nextDraft: draft, acceptList: false, showError: true };
}

export function resolveFreetimeMinutes(selected: number | undefined | null, fallback = FREETIME_DEFAULT_MINUTES) {
  if (typeof selected === "number" && Number.isFinite(selected) && selected > 0) {
    return selected;
  }
  return fallback;
}

export function taskFitsFreeTimeWindow(
  task: {
    status: string;
    planned_start_at?: string | null;
    planned_end_at?: string | null;
  },
  minutes: number,
) {
  if (task.status !== "open") return false;
  if (task.planned_start_at && task.planned_end_at) {
    const duration =
      (Date.parse(task.planned_end_at) - Date.parse(task.planned_start_at)) / 60_000;
    if (Number.isFinite(duration) && duration > 0) return duration <= minutes;
  }
  return true;
}
