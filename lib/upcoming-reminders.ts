import {
  effectiveReminderOffset,
  reminderBase,
  reminderLabel,
  remindAtIso,
} from "./reminders.ts";
import { jerusalemParts } from "./time.ts";
import type { TaskRow } from "./types.ts";

export type UpcomingReminder = {
  id: string;
  title: string;
  remind_at: string;
  base_at: string;
  base_source: "reminder_at" | "due_at" | "planned_start_at";
  offset: number;
  label: string;
};

export function listUpcomingReminders(
  tasks: TaskRow[],
  defaultMinutes: number,
  now = new Date(),
  limit = 20,
): UpcomingReminder[] {
  const current = now.getTime();
  const rows: UpcomingReminder[] = [];
  for (const task of tasks) {
    if (task.status !== "open") continue;
    if (!task.reminder_enabled || task.reminder_sent_at) continue;
    const base = reminderBase(task);
    if (!base) continue;
    const offset = effectiveReminderOffset({
      reminder_at: task.reminder_at,
      due_at: task.due_at,
      planned_start_at: task.planned_start_at,
      reminder_enabled: task.reminder_enabled,
      reminder_offset_minutes: task.reminder_offset_minutes,
      default_reminder_minutes: defaultMinutes,
    });
    if (offset == null) continue;
    const remindAt = remindAtIso(base.at, offset);
    if (new Date(remindAt).getTime() <= current) continue;
    rows.push({
      id: task.id,
      title: task.title,
      remind_at: remindAt,
      base_at: base.at,
      base_source: base.source,
      offset,
      label: reminderLabel(offset),
    });
  }
  rows.sort((a, b) => a.remind_at.localeCompare(b.remind_at));
  return rows.slice(0, limit);
}

export function formatUpcomingWhen(remindAt: string, now = new Date()) {
  const parts = jerusalemParts(remindAt);
  const today = jerusalemParts(now).date;
  if (parts.date === today) return `היום · ${parts.time}`;
  const formatted = new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(remindAt));
  return `${formatted} · ${parts.time}`;
}
