import {
  DEFAULT_REMINDER_MINUTES,
  effectiveReminderOffset,
  reminderBase,
  reminderDispatchState,
  remindAtIso,
  REMINDER_CLAIM_STALE_MS,
} from "./reminders.ts";

export type ReminderTask = {
  id: string;
  user_id: string;
  title: string;
  status: string;
  reminder_at: string | null;
  due_at: string | null;
  planned_start_at: string | null;
  reminder_enabled: boolean;
  reminder_offset_minutes: number | null;
  reminder_sent_at: string | null;
  reminder_claimed_at: string | null;
};

export type PlannedReminder =
  | { kind: "wait" }
  | { kind: "skip"; reason: string }
  | { kind: "expire" }
  | { kind: "send"; offset: number; remindAt: string };

export function planTaskReminder(
  task: ReminderTask,
  defaultMinutes: number,
  now: Date,
): PlannedReminder {
  if (task.status === "done" || task.status === "cancelled") {
    return { kind: "skip", reason: task.status };
  }
  if (task.status !== "open") return { kind: "skip", reason: "not_open" };
  if (task.reminder_sent_at) return { kind: "skip", reason: "already_sent" };
  const offset = effectiveReminderOffset({
    reminder_at: task.reminder_at,
    due_at: task.due_at,
    planned_start_at: task.planned_start_at,
    reminder_enabled: task.reminder_enabled,
    reminder_offset_minutes: task.reminder_offset_minutes,
    default_reminder_minutes: defaultMinutes ?? DEFAULT_REMINDER_MINUTES,
  });
  if (offset == null) {
    const base = reminderBase(task);
    return {
      kind: "skip",
      reason: base ? "disabled" : "no_base",
    };
  }
  const base = reminderBase(task);
  if (!base) return { kind: "skip", reason: "no_base" };
  const remindAt = remindAtIso(base.at, offset);
  const state = reminderDispatchState(now, remindAt);
  if (state === "future") return { kind: "wait" };
  if (state === "expired") return { kind: "expire" };
  return { kind: "send", offset, remindAt };
}

export function isClaimFresh(
  claimedAt: string | null,
  now: Date,
  staleMs = REMINDER_CLAIM_STALE_MS,
) {
  if (!claimedAt) return false;
  return now.getTime() - new Date(claimedAt).getTime() < staleMs;
}

export function goneSubscriptionStatus(status: number) {
  return status === 404 || status === 410;
}
