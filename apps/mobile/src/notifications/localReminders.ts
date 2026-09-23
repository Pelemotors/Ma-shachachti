import { Linking } from "react-native";
import type { MobileTask } from "../api/tasks";

type NotificationsMod = typeof import("expo-notifications");

const ID_PREFIX = "task:";
const CHANNEL = "reminders";
const TITLE = "מה שכחתי?";
const BODY = "יש לך תזכורת ממתינה";

let runtimeReady = false;

export function localNotificationId(taskId: string) {
  return `${ID_PREFIX}${taskId}`;
}

export function shouldScheduleLocalReminder(task: MobileTask, nowMs = Date.now()) {
  if (task.status !== "open") return false;
  if (task.reminder_enabled === false) return false;
  if (!task.reminder_at) return false;
  const at = Date.parse(task.reminder_at);
  return Number.isFinite(at) && at > nowMs + 5_000;
}

export type ScheduledLocalRow = {
  identifier: string;
  triggerMs: number | null;
};

export type LocalReminderPlan = {
  cancel: string[];
  schedule: Array<{ id: string; taskId: string; atMs: number }>;
  skip: string[];
};

export function planLocalReminderSync(
  tasks: MobileTask[],
  existing: ScheduledLocalRow[],
  nowMs = Date.now(),
): LocalReminderPlan {
  const wanted = new Map<string, MobileTask>();
  for (const task of tasks) {
    if (shouldScheduleLocalReminder(task, nowMs)) {
      wanted.set(localNotificationId(task.id), task);
    }
  }
  const ours = existing.filter((row) => row.identifier.startsWith(ID_PREFIX));
  const cancel: string[] = [];
  const schedule: Array<{ id: string; taskId: string; atMs: number }> = [];
  const skip: string[] = [];

  for (const row of ours) {
    if (!wanted.has(row.identifier)) cancel.push(row.identifier);
  }

  for (const [id, task] of wanted) {
    const when = Date.parse(task.reminder_at as string);
    const already = ours.find((row) => row.identifier === id);
    if (already) {
      if (already.triggerMs != null && Math.abs(already.triggerMs - when) < 2_000) {
        skip.push(id);
        continue;
      }
      if (!cancel.includes(id)) cancel.push(id);
    }
    schedule.push({ id, taskId: task.id, atMs: when });
  }
  return { cancel, schedule, skip };
}

async function loadNotifications(): Promise<NotificationsMod> {
  return import("expo-notifications");
}

export async function ensureLocalNotificationRuntime() {
  const Notifications = await loadNotifications();
  if (!runtimeReady) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    Notifications.addNotificationResponseReceivedListener(() => {
      void Linking.openURL("mashachachti://app").catch(() => undefined);
    });
    runtimeReady = true;
  }
  if (Notifications.setNotificationChannelAsync) {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "תזכורות",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#BC6E45",
    });
  }
  await ensurePermission(Notifications);
  return Notifications;
}

async function ensurePermission(Notifications: NotificationsMod) {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain === false) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted === true;
}

function triggerFor(Notifications: NotificationsMod, atMs: number) {
  const seconds = Math.max(6, Math.round((atMs - Date.now()) / 1000));
  const type =
    Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL ??
    ("timeInterval" as const);
  return { type, seconds, repeats: false, channelId: CHANNEL };
}

function triggerWhenMs(trigger: unknown, content?: unknown): number | null {
  if (content && typeof content === "object") {
    const data = (content as { data?: { remindAt?: unknown } }).data;
    if (typeof data?.remindAt === "string") {
      const parsed = Date.parse(data.remindAt);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (typeof data?.remindAt === "number" && Number.isFinite(data.remindAt)) {
      return data.remindAt;
    }
  }
  if (!trigger || typeof trigger !== "object") return null;
  const raw = trigger as { date?: unknown; value?: unknown };
  if (raw.date instanceof Date) return raw.date.getTime();
  if (typeof raw.date === "number") return raw.date;
  if (typeof raw.date === "string") {
    const parsed = Date.parse(raw.date);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof raw.value === "number") return raw.value;
  return null;
}

export async function cancelLocalReminder(taskId: string) {
  const Notifications = await ensureLocalNotificationRuntime();
  await Notifications.cancelScheduledNotificationAsync(localNotificationId(taskId));
}

export async function syncLocalReminders(tasks: MobileTask[]) {
  const Notifications = await ensureLocalNotificationRuntime();
  if (!(await ensurePermission(Notifications))) {
    console.warn("[localReminders] permission not granted");
    return;
  }

  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const plan = planLocalReminderSync(
    tasks,
    existing.map((row) => ({
      identifier: row.identifier,
      triggerMs: triggerWhenMs(row.trigger, row.content),
    })),
  );

  for (const id of plan.cancel) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }

  for (const row of plan.schedule) {
    await Notifications.scheduleNotificationAsync({
      identifier: row.id,
      content: {
        title: TITLE,
        body: BODY,
        sound: true,
        data: { taskId: row.taskId, remindAt: new Date(row.atMs).toISOString() },
        autoDismiss: true,
      },
      trigger: triggerFor(Notifications, row.atMs),
    });
  }
}
