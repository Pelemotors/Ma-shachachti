import type { AppState, DailyPlanSession, Task } from "../../model";
import { isRoutineHousehold } from "../forgotten";

export type NotificationUrgency = "low" | "medium" | "urgent";

export type NotificationReason =
  | "routine_suppressed"
  | "wait_complete"
  | "explicit_reminder"
  | "hard_deadline"
  | "urgent_priority"
  | "medium_digest"
  | "low_suppressed"
  | "none";

export type NotificationDecision = {
  shouldNotify: boolean;
  urgency: NotificationUrgency;
  reason: NotificationReason;
  groupKey?: string;
};

export function evaluateNotificationPolicy(input: {
  task?: Task | null;
  reminder?: AppState["reminders"][number] | null;
  plan?: DailyPlanSession | null;
  personalization?: AppState["compactedMemory"] | null;
  now?: Date;
}): NotificationDecision {
  const now = input.now ?? new Date();
  void input.plan;
  void input.personalization;

  if (input.reminder) {
    const urgency = input.reminder.urgency ?? "medium";
    return {
      shouldNotify: true,
      urgency,
      reason: "explicit_reminder",
      groupKey: `reminder:${input.reminder.id}`,
    };
  }

  const task = input.task;
  if (!task) {
    return {
      shouldNotify: false,
      urgency: "low",
      reason: "none",
    };
  }

  if (task.priority >= 3) {
    return {
      shouldNotify: true,
      urgency: "urgent",
      reason: "urgent_priority",
      groupKey: `task:${task.id}`,
    };
  }

  if (
    task.waitMinutes > 0 &&
    task.status === "done" &&
    task.completedAt &&
    Date.parse(task.completedAt) > now.getTime() - task.waitMinutes * 60000
  ) {
    return {
      shouldNotify: true,
      urgency: "medium",
      reason: "wait_complete",
      groupKey: `wait:${task.id}`,
    };
  }

  if (task.dueAt) {
    const hours = (Date.parse(task.dueAt) - now.getTime()) / 3600000;
    if (hours <= 2) {
      return {
        shouldNotify: true,
        urgency: hours < 0 ? "urgent" : "medium",
        reason: "hard_deadline",
        groupKey: `due:${task.id}`,
      };
    }
  }

  if (isRoutineHousehold(task)) {
    return {
      shouldNotify: false,
      urgency: "low",
      reason: "routine_suppressed",
    };
  }

  if (task.priority <= 1) {
    return {
      shouldNotify: false,
      urgency: "low",
      reason: "low_suppressed",
    };
  }

  return {
    shouldNotify: true,
    urgency: "medium",
    reason: "medium_digest",
    groupKey: "life-admin-digest",
  };
}
