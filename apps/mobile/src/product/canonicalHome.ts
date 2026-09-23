export type HomeNowIcon = "cart" | "calendar" | "package" | "clock";

export type HomeNowRow = {
  id: string;
  taskId: string | null;
  time: string;
  title: string;
  icon: HomeNowIcon;
};

export type PlanItemLike = {
  task_id: string;
  start_at: string;
};

export type PlanLike = {
  plan: { id: string; plan_date?: string } | null;
  items: PlanItemLike[];
} | null;

export type TaskLike = {
  id: string;
  title: string;
  status: "open" | "done" | "cancelled" | string;
};

function iconForTitle(title: string): HomeNowIcon {
  if (/קני|חלב|טיטול|סופר/.test(title)) return "cart";
  if (/רופא|תור|קלינ|יומן/.test(title)) return "calendar";
  if (/חבילה|דואר|משלוח/.test(title)) return "package";
  return "clock";
}

export function formatHomePlanTime(iso: string, timeZone = "Asia/Jerusalem") {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Home "עכשיו אצלך" is day_plan of today joined to tasks. Not listTasks. Not fixture. */
export function buildHomeNow(input: {
  plan: PlanLike;
  tasks: TaskLike[];
  nowMs: number;
  formatTime?: (iso: string) => string;
}): {
  hasPlan: boolean;
  done: number;
  total: number;
  rows: HomeNowRow[];
} {
  const items = input.plan?.items ?? [];
  const hasPlan = Boolean(input.plan?.plan) && items.length > 0;
  const byId = new Map(input.tasks.map((task) => [task.id, task]));
  const actionable = items.filter((item) => {
    const task = byId.get(item.task_id);
    return !task || task.status !== "cancelled";
  });
  const done = actionable.filter((item) => byId.get(item.task_id)?.status === "done").length;
  const upcoming = items
    .filter((item) => {
      const task = byId.get(item.task_id);
      if (!task || task.status !== "open") return false;
      return new Date(item.start_at).getTime() >= input.nowMs - 15 * 60 * 1000;
    })
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .slice(0, 2)
    .map((item) => {
      const task = byId.get(item.task_id);
      const title = task?.title ?? "פריט בלו״ז";
      const format = input.formatTime ?? formatHomePlanTime;
      return {
        id: `${item.task_id}-${item.start_at}`,
        taskId: item.task_id,
        time: format(item.start_at),
        title,
        icon: iconForTitle(title),
      };
    });

  return {
    hasPlan,
    done,
    total: actionable.length,
    rows: hasPlan ? upcoming : [],
  };
}
