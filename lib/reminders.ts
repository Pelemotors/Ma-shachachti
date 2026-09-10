export const REMINDER_GRACE_MS = 2 * 60 * 60 * 1000;
export const REMINDER_CLAIM_STALE_MS = 5 * 60 * 1000;
export const DEFAULT_REMINDER_MINUTES = 30;
export const REMINDER_MINUTE_OPTIONS = [10, 30, 60, 180, 1440] as const;

export type ReminderMinuteOption = (typeof REMINDER_MINUTE_OPTIONS)[number];

export function isReminderMinuteOption(
  value: unknown,
): value is ReminderMinuteOption {
  return (
    typeof value === "number" &&
    (REMINDER_MINUTE_OPTIONS as readonly number[]).includes(value)
  );
}

export function formatTaskReminder(input: {
  due_at: string | null;
  reminder_enabled: boolean;
  reminder_offset_minutes: number | null;
  default_reminder_minutes: number;
}) {
  if (!input.due_at) return "";
  if (!input.reminder_enabled) return "ללא התראה";
  return reminderLabel(
    input.reminder_offset_minutes ?? input.default_reminder_minutes,
  );
}

export function reminderLabel(minutes: number) {
  if (minutes === 10) return "10 דקות לפני";
  if (minutes === 30) return "30 דקות לפני";
  if (minutes === 60) return "שעה לפני";
  if (minutes === 180) return "3 שעות לפני";
  if (minutes === 1440) return "יום לפני";
  return `${minutes} דקות לפני`;
}

export function effectiveReminderOffset(input: {
  due_at: string | null;
  reminder_enabled: boolean;
  reminder_offset_minutes: number | null;
  default_reminder_minutes: number;
}) {
  if (!input.due_at || !input.reminder_enabled) return null;
  if (input.reminder_offset_minutes != null) return input.reminder_offset_minutes;
  return input.default_reminder_minutes;
}

export function remindAtIso(dueAt: string, offsetMinutes: number) {
  return new Date(new Date(dueAt).getTime() - offsetMinutes * 60_000).toISOString();
}

export function reminderDispatchState(
  now: Date,
  remindAt: string,
): "future" | "due" | "expired" {
  const at = new Date(remindAt).getTime();
  const current = now.getTime();
  if (at > current) return "future";
  if (current - at > REMINDER_GRACE_MS) return "expired";
  return "due";
}

export function shouldResetReminderDelivery(input: {
  previousDueAt: string | null;
  nextDueAt: string | null;
  previousOffset: number | null;
  nextOffset: number | null;
  previousEnabled: boolean;
  nextEnabled: boolean;
}) {
  if (input.previousDueAt !== input.nextDueAt) return true;
  if (input.previousOffset !== input.nextOffset) return true;
  if (!input.previousEnabled && input.nextEnabled) return true;
  return false;
}
