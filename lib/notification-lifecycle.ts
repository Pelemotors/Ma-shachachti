export type ReminderState = "active" | "missed" | "snoozed" | "handled" | "cancelled";
export type ReminderAction =
  | { kind: "handled" }
  | { kind: "cancel" }
  | { kind: "snooze"; until: string }
  | { kind: "change"; until: string };

export type ReminderRecord = {
  state: ReminderState;
  remind_at: string | null;
  handled_at?: string | null;
  snoozed_until?: string | null;
};

export function reminderStateAt(record: ReminderRecord, now: Date) {
  if (record.state !== "active") return record.state;
  if (record.remind_at && Date.parse(record.remind_at) < now.getTime()) return "missed" as const;
  return "active" as const;
}

export function applyReminderAction(
  record: ReminderRecord,
  action: ReminderAction,
  now = new Date(),
): ReminderRecord {
  const at = action.kind === "snooze" || action.kind === "change" ? Date.parse(action.until) : NaN;
  if ((action.kind === "snooze" || action.kind === "change") && !Number.isFinite(at)) {
    throw new Error("invalid_reminder_time");
  }
  if ((action.kind === "snooze" || action.kind === "change") && at <= now.getTime()) {
    throw new Error("reminder_time_must_be_future");
  }
  const handledAt = now.toISOString();
  if (action.kind === "handled") {
    return { ...record, state: "handled", handled_at: handledAt };
  }
  if (action.kind === "cancel") {
    return { ...record, state: "cancelled", handled_at: null, snoozed_until: null };
  }
  if (action.kind === "snooze") {
    return { ...record, state: "snoozed", remind_at: action.until, snoozed_until: action.until, handled_at: null };
  }
  return { ...record, state: "active", remind_at: action.until, snoozed_until: null, handled_at: null };
}
