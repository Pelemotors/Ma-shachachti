import type { AppState, DailyPlanSession, Task } from "../../model";
import { isRoutineHousehold } from "../forgotten";
import type { ForecastModel } from "../forecast";
import { forecastActionableNow } from "../forecast";

export type NotificationUrgency = "low" | "medium" | "urgent";

export type NotificationReason =
  | "routine_suppressed"
  | "wait_complete"
  | "explicit_reminder"
  | "hard_deadline"
  | "urgent_priority"
  | "medium_digest"
  | "low_suppressed"
  | "quiet_hours"
  | "forecast_digest"
  | "none";

export type NotificationChannel = "immediate" | "digest" | "in_app" | "none";

export type NotificationDecision = {
  shouldNotify: boolean;
  urgency: NotificationUrgency;
  reason: NotificationReason;
  channel: NotificationChannel;
  groupKey?: string;
};

function inQuietHours(
  now: Date,
  quietStart: number,
  quietEnd: number,
): boolean {
  const hour = now.getHours();
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return hour >= quietStart && hour < quietEnd;
  return hour >= quietStart || hour < quietEnd;
}

/**
 * Deterministic notification policy from structured state only.
 * Does not parse natural language or keyword urgency.
 */
export function evaluateNotificationPolicy(input: {
  task?: Task | null;
  reminder?: AppState["reminders"][number] | null;
  plan?: DailyPlanSession | null;
  personalization?: AppState["compactedMemory"] | null;
  profile?: AppState["profile"] | null;
  forecast?: ForecastModel | null;
  now?: Date;
}): NotificationDecision {
  const now = input.now ?? new Date();
  void input.plan;
  void input.personalization;

  const quiet =
    input.profile != null &&
    inQuietHours(now, input.profile.quietStart, input.profile.quietEnd);

  if (input.reminder) {
    const urgency = input.reminder.urgency ?? "medium";
    if (quiet && urgency !== "urgent") {
      return {
        shouldNotify: false,
        urgency,
        reason: "quiet_hours",
        channel: "digest",
        groupKey: `reminder:${input.reminder.id}`,
      };
    }
    return {
      shouldNotify: true,
      urgency,
      reason: "explicit_reminder",
      channel: urgency === "urgent" ? "immediate" : "digest",
      groupKey: `reminder:${input.reminder.id}`,
    };
  }

  if (input.forecast && forecastActionableNow(input.forecast, now)) {
    return {
      shouldNotify: input.forecast.confidence >= 0.7 && !quiet,
      urgency: "medium",
      reason: "forecast_digest",
      channel: "digest",
      groupKey: `forecast:${input.forecast.id}`,
    };
  }

  const task = input.task;
  if (!task) {
    return {
      shouldNotify: false,
      urgency: "low",
      reason: "none",
      channel: "none",
    };
  }

  if (task.priority >= 3) {
    return {
      shouldNotify: true,
      urgency: "urgent",
      reason: "urgent_priority",
      channel: "immediate",
      groupKey: `task:${task.id}`,
    };
  }

  if (task.waitMinutes > 0 && task.status === "done" && task.completedAt) {
    const readyAt = Date.parse(task.completedAt) + task.waitMinutes * 60000;
    // Notify only after wait ended, within a short ready window (not while machine still runs).
    if (readyAt <= now.getTime() && now.getTime() - readyAt < 45 * 60000) {
      return {
        shouldNotify: !quiet,
        urgency: "medium",
        reason: "wait_complete",
        channel: quiet ? "digest" : "immediate",
        groupKey: `wait:${task.id}`,
      };
    }
  }

  if (task.dueAt) {
    const hours = (Date.parse(task.dueAt) - now.getTime()) / 3600000;
    if (hours <= 2) {
      const urgency = hours < 0 ? "urgent" : "medium";
      return {
        shouldNotify: urgency === "urgent" || !quiet,
        urgency,
        reason: "hard_deadline",
        channel: urgency === "urgent" ? "immediate" : "digest",
        groupKey: `due:${task.id}`,
      };
    }
  }

  if (isRoutineHousehold(task)) {
    return {
      shouldNotify: false,
      urgency: "low",
      reason: "routine_suppressed",
      channel: "none",
    };
  }

  if (task.priority <= 1) {
    return {
      shouldNotify: false,
      urgency: "low",
      reason: "low_suppressed",
      channel: "in_app",
    };
  }

  return {
    shouldNotify: !quiet,
    urgency: "medium",
    reason: "medium_digest",
    channel: "digest",
    groupKey: "life-admin-digest",
  };
}
