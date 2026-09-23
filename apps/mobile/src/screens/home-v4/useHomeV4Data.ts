import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { getProfile } from "../../api/profile";
import { listNotifications, type MobileNotification } from "../../api/notifications";
import { formatPlanTime, getDayPlan, todayJerusalemDate, type MobileDayPlan } from "../../api/planning";
import { listTasks, type MobileTask } from "../../api/tasks";
import { getSupabase } from "../../api/supabase";
import { greetingName, timeGreeting } from "../../product/greeting";
import { buildHomeNow, type HomeNowRow } from "../../product/canonicalHome";
import { productNowMs, syncProductClock } from "../../product/productClock";

export type { HomeNowRow };

export type HomeReminderCandidate = {
  id: string;
  title: string;
  dueLabel: string;
};

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

function pickReminder(tasks: MobileTask[], today: string): HomeReminderCandidate | null {
  const open = tasks.filter((task) => task.status === "open" && !task.reminder_enabled);
  const rank = (task: MobileTask) => {
    if (task.due_on && task.due_on < today) return 0;
    if (task.due_on === today) return 1;
    if (!task.due_on) return 2;
    return 3;
  };
  const sorted = [...open].sort((a, b) => rank(a) - rank(b));
  const task = sorted[0];
  if (!task) return null;
  const dueLabel = task.due_at
    ? `עד ${formatPlanTime(task.due_at)}`
    : task.due_on === today
      ? "היום"
      : task.due_on
        ? task.due_on.slice(5).replace("-", "/")
        : "בלי מועד";
  return { id: task.id, title: task.title, dueLabel };
}

export function useHomeV4Data() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [clockEpoch, setClockEpoch] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<MobileNotification[]>([]);
  const [plan, setPlan] = useState<MobileDayPlan | null>(null);
  const [tasks, setTasks] = useState<MobileTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    await syncProductClock();
    setClockEpoch((value) => value + 1);
    const today = todayJerusalemDate();
    const results = await Promise.allSettled([
      getProfile(),
      listNotifications(),
      getDayPlan(today),
      listTasks(),
    ]);
    const nextErrors: Record<string, string> = {};
    const fail = (key: string, result: PromiseSettledResult<unknown>) => {
      if (result.status === "rejected") {
        nextErrors[key] = result.reason instanceof Error ? result.reason.message : "שגיאה";
      }
    };
    fail("profile", results[0]);
    fail("notifications", results[1]);
    fail("plan", results[2]);
    fail("tasks", results[3]);

    const profile = settled(results[0], { profile: { user_id: "", display_name: null } });
    const notes = settled(results[1], { notifications: [] as MobileNotification[] });
    const dayPlan = settled(results[2], null as MobileDayPlan | null);
    const taskPayload = settled(results[3], { tasks: [] as MobileTask[] });

    const name = greetingName(profile.profile.display_name);
    setDisplayName(name);
    const profileAvatar =
      typeof profile.profile.avatar_url === "string" && profile.profile.avatar_url
        ? profile.profile.avatar_url
        : null;
    try {
      const { data } = await getSupabase().auth.getUser();
      const meta = data.user?.user_metadata ?? {};
      const avatar =
        profileAvatar ||
        (typeof meta.avatar_url === "string" && meta.avatar_url) ||
        (typeof meta.picture === "string" && meta.picture) ||
        null;
      setAvatarUrl(avatar);
    } catch {
      setAvatarUrl(profileAvatar);
    }
    setNotifications(notes.notifications);
    setPlan(dayPlan);
    setTasks(taskPayload.tasks);
    setErrors(nextErrors);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void reload({ silent: true });
    });
    return () => sub.remove();
  }, [reload]);

  // Derive every render from ProductClock — never cache a wall-clock greeting.
  void clockEpoch;
  const greeting = timeGreeting(displayName);
  const today = todayJerusalemDate();
  const now = buildHomeNow({
    plan,
    tasks,
    nowMs: productNowMs(),
    formatTime: formatPlanTime,
  });
  const reminder = pickReminder(tasks, today);
  const unread = notifications.some((item) => !item.opened_at);

  return {
    loading,
    errors,
    reload,
    displayName,
    greeting,
    avatarUrl,
    notifications,
    unread,
    hasPlan: now.hasPlan,
    rows: now.rows,
    progressDone: now.done,
    progressTotal: now.total,
    reminder,
    hasLiveReminder: Boolean(reminder),
    businessDate: today,
  };
}
