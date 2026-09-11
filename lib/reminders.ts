export const REMINDER_GRACE_MS = 2 * 60 * 60 * 1000;
export const REMINDER_CLAIM_STALE_MS = 5 * 60 * 1000;
export const DEFAULT_REMINDER_MINUTES = 30;
export const REMINDER_MINUTE_OPTIONS = [0, 10, 30, 60, 180, 1440] as const;

export type ReminderMinuteOption = (typeof REMINDER_MINUTE_OPTIONS)[number];
export type ReminderBaseSource = "reminder_at" | "due_at" | "planned_start_at";

export function reminderBase(input: {
  reminder_at: string | null;
  due_at: string | null;
  planned_start_at: string | null;
}): { at: string; source: ReminderBaseSource } | null {
  if (input.reminder_at) return { at: input.reminder_at, source: "reminder_at" };
  if (input.due_at) return { at: input.due_at, source: "due_at" };
  if (input.planned_start_at) {
    return { at: input.planned_start_at, source: "planned_start_at" };
  }
  return null;
}

export function isReminderMinuteOption(
  value: unknown,
): value is ReminderMinuteOption {
  return (
    typeof value === "number" &&
    (REMINDER_MINUTE_OPTIONS as readonly number[]).includes(value)
  );
}

export function formatTaskReminder(input: {
  reminder_at?: string | null;
  due_at: string | null;
  planned_start_at?: string | null;
  reminder_enabled: boolean;
  reminder_offset_minutes: number | null;
  default_reminder_minutes: number;
}) {
  if (
    !reminderBase({
      reminder_at: input.reminder_at ?? null,
      due_at: input.due_at,
      planned_start_at: input.planned_start_at ?? null,
    })
  ) {
    return "";
  }
  if (!input.reminder_enabled) return "ללא התראה";
  return reminderLabel(
    input.reminder_offset_minutes ?? input.default_reminder_minutes,
  );
}

export function reminderLabel(minutes: number) {
  if (minutes === 0) return "בזמן המשימה";
  if (minutes === 10) return "10 דקות לפני";
  if (minutes === 30) return "30 דקות לפני";
  if (minutes === 60) return "שעה לפני";
  if (minutes === 180) return "3 שעות לפני";
  if (minutes === 1440) return "יום לפני";
  return `${minutes} דקות לפני`;
}

export function effectiveReminderOffset(input: {
  reminder_at?: string | null;
  due_at: string | null;
  planned_start_at?: string | null;
  reminder_enabled: boolean;
  reminder_offset_minutes: number | null;
  default_reminder_minutes: number;
}) {
  if (
    !input.reminder_enabled ||
    !reminderBase({
      reminder_at: input.reminder_at ?? null,
      due_at: input.due_at,
      planned_start_at: input.planned_start_at ?? null,
    })
  ) {
    return null;
  }
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
  previousReminderAt?: string | null;
  nextReminderAt?: string | null;
  previousDueAt: string | null;
  nextDueAt: string | null;
  previousPlannedStartAt?: string | null;
  nextPlannedStartAt?: string | null;
  previousOffset: number | null;
  nextOffset: number | null;
  previousEnabled: boolean;
  nextEnabled: boolean;
}) {
  if ((input.previousReminderAt ?? null) !== (input.nextReminderAt ?? null)) {
    return true;
  }
  if (input.previousDueAt !== input.nextDueAt) return true;
  if (
    (input.previousPlannedStartAt ?? null) !==
    (input.nextPlannedStartAt ?? null)
  ) {
    return true;
  }
  if (input.previousOffset !== input.nextOffset) return true;
  if (input.previousEnabled !== input.nextEnabled) return true;
  return false;
}
