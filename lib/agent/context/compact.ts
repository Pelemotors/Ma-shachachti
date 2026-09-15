import type { ChatSurface } from "../../home-surfaces.ts";
import type { SurfaceContext } from "../../chat-request.ts";
import type {
  ConsequenceRow,
  MemoryRow,
  TaskRow,
} from "../../types.ts";
import type { Checklist, ShoppingItem } from "../../lists.ts";
import type { AgentProfileContext } from "../../user-profile.ts";
import { dueTimeFromDueAt, jerusalemParts } from "../../time.ts";
import { reminderBase } from "../../reminders.ts";
import { selectPersonalMemories } from "./memory-select.ts";
import {
  selectLearnedActionRelations,
  renderLearnedRelationsBlock,
} from "../learned-relations.ts";
import {
  formatCandidateMeta,
  rankTaskCandidates,
  type RankedCandidate,
} from "../candidate-rank.ts";

export type CompactContext = {
  profile: AgentProfileContext | null;
  currentTime: string;
  memories: MemoryRow[];
  tasks: TaskRow[];
  consequences: ConsequenceRow[];
  shopping: ShoppingItem[];
  checklists: Checklist[];
  historyLimit: number;
  modules: string[];
  memoryCount: number;
  ranked?: RankedCandidate[];
};

function formatTask(
  task: TaskRow,
  consequence?: ConsequenceRow,
  ranked?: RankedCandidate,
) {
  const clock = dueTimeFromDueAt(task.due_at);
  const due = task.due_on ? ` | due ${task.due_on}` : " | due none";
  const time = clock ? ` | at ${clock}` : task.due_on ? " | at none" : "";
  const planned = task.planned_start_at
    ? ` | planned ${jerusalemParts(task.planned_start_at).date} ${jerusalemParts(task.planned_start_at).time}`
    : "";
  const base = reminderBase(task);
  const reminder = base
    ? task.reminder_enabled
      ? ` | reminder on`
      : " | reminder off"
    : "";
  const reschedules = ` | reschedule_count ${task.reschedule_count ?? 0}`;
  const lastRescheduled = task.last_rescheduled_at
    ? ` | last_rescheduled_at ${task.last_rescheduled_at}`
    : "";
  const created = ` | created_at ${task.created_at}`;
  const consequenceText = consequence
    ? ` | consequence severity=${consequence.severity}`
    : "";
  const rankText = ranked ? ` | ${formatCandidateMeta(ranked)}` : "";
  return `- ${task.id} [${task.status}] ${task.title}${due}${time}${planned}${reminder}${reschedules}${lastRescheduled}${created}${consequenceText}${rankText}`;
}

export function buildCompactContext(input: {
  surface: ChatSurface | null;
  surfaceContext: SurfaceContext | null;
  profile: AgentProfileContext | null;
  currentTime: string;
  queryHint: string;
  allTasks: TaskRow[];
  allMemory: MemoryRow[];
  consequences: ConsequenceRow[];
  shopping: ShoppingItem[];
  checklists: Checklist[];
  /** Extra purpose when surface is null (e.g. brain-dump processing). */
  purpose?: "chat" | "brain-dump" | null;
}): CompactContext {
  const modules = ["core", "compact-context"];
  const openTasks = input.allTasks.filter((task) => task.status === "open");
  let ranked: RankedCandidate[] | undefined;

  let tasks: TaskRow[] = [];
  let shopping: ShoppingItem[] = [];
  let checklists: Checklist[] = [];
  let historyLimit = 10;

  if (input.purpose === "brain-dump") {
    modules.push("brain-dump");
    // Need tasks + shopping for classify/dedupe; keep compact but useful.
    tasks = openTasks.slice(0, 40);
    shopping = input.shopping.slice(0, 40);
    checklists = input.checklists.slice(0, 8);
    historyLimit = 0;
  } else if (input.surface == null) {
    modules.push("normal");
    // Compact: recent/open slice — not the full dump, not empty.
    tasks = openTasks.slice(0, 20);
    shopping = [];
    checklists = [];
    historyLimit = 10;
  } else if (input.surface === "forgotten" || input.surface === "focus") {
    modules.push("forgotten-high-recall");
    ranked = rankTaskCandidates({
      tasks: openTasks,
      consequences: input.consequences,
      limit: Math.min(openTasks.length, 80),
    });
    tasks = ranked.map((row) => row.task);
    historyLimit = 6;
  } else if (input.surface === "deep-check") {
    modules.push("deep-check-wide");
    ranked = rankTaskCandidates({
      tasks: openTasks,
      consequences: input.consequences,
      limit: Math.min(openTasks.length, 80),
    });
    tasks = ranked.map((row) => row.task);
    shopping = input.shopping.slice(0, 40);
    checklists = input.checklists.slice(0, 12);
    historyLimit = 8;
  } else if (input.surface === "schedule") {
    modules.push("schedule-day");
    const date =
      input.surfaceContext?.type === "schedule"
        ? input.surfaceContext.date
        : null;
    const pool = openTasks.filter((task) => {
      if (!date) return Boolean(task.due_at || task.planned_start_at || task.due_on);
      const dueAtDate = task.due_at ? jerusalemParts(task.due_at).date : null;
      const plannedDate = task.planned_start_at
        ? jerusalemParts(task.planned_start_at).date
        : null;
      return (
        task.due_on === date ||
        dueAtDate === date ||
        plannedDate === date ||
        (!task.due_on && !task.due_at && !task.planned_start_at)
      );
    });
    // Rank before truncating so important undated work is not lost to recency.
    ranked = rankTaskCandidates({
      tasks: pool,
      consequences: input.consequences,
      limit: Math.min(pool.length, 60),
    });
    tasks = ranked.map((row) => row.task);
    historyLimit = 4;
  } else if (input.surface === "free-time") {
    modules.push("free-time-window");
    const minutes =
      input.surfaceContext?.type === "free-time"
        ? input.surfaceContext.minutes
        : null;
    ranked = rankTaskCandidates({
      tasks: openTasks,
      consequences: input.consequences,
      freeMinutes: minutes,
      limit: Math.min(openTasks.length, 50),
    });
    tasks = ranked.map((row) => row.task);
    historyLimit = 4;
  }

  const memories = selectPersonalMemories({
    memories: input.allMemory,
    queryHint: input.queryHint,
    limit: input.surface === "deep-check" || input.purpose === "brain-dump" ? 10 : 6,
  });

  const consequences = input.consequences.filter((row) =>
    tasks.some((task) => task.id === row.task_id),
  );

  return {
    profile: input.profile,
    currentTime: input.currentTime,
    memories,
    tasks,
    consequences,
    shopping,
    checklists,
    historyLimit,
    modules,
    memoryCount: memories.length,
    ranked,
  };
}

export function renderContextBlock(ctx: CompactContext, surface: ChatSurface | null) {
  const lines: string[] = [`## זמן נוכחי\n${ctx.currentTime}`];
  if (ctx.profile?.display_name) {
    lines.push(
      `## פרופיל\nשם: ${ctx.profile.display_name}; פנייה: ${ctx.profile.address_style}`,
    );
  }
  if (ctx.memories.length) {
    lines.push(
      `## Memory רלוונטי\n${ctx.memories.map((m) => `- ${m.id} [${m.source}] ${m.content}`).join("\n")}`,
    );
  }
  const relations = selectLearnedActionRelations(ctx.memories);
  const relationBlock = renderLearnedRelationsBlock(relations);
  if (relationBlock) lines.push(relationBlock);
  if (ctx.tasks.length) {
    const byId = new Map(ctx.consequences.map((row) => [row.task_id, row]));
    const rankedById = new Map(
      (ctx.ranked ?? []).map((row) => [row.task.id, row]),
    );
    const label =
      surface === "forgotten" || surface === "focus"
        ? "## מועמדים למשימות פתוחות (ranked high-recall — אתה בוחר; העדף consequence/דחייה/מועד על פני recency)"
        : surface === "free-time"
          ? "## מועמדים לזמן פנוי (ranked — לא לפי recency בלבד; planned_today אינו יתרון יחיד)"
          : surface === "schedule"
            ? "## מועמדים ללו״ז (ranked לפני truncation; undated חשובים נשארים בתחרות)"
            : "## משימות רלוונטיות";
    lines.push(
      `${label}\n${ctx.tasks
        .map((task) =>
          formatTask(task, byId.get(task.id), rankedById.get(task.id)),
        )
        .join("\n")}`,
    );
  }
  if (ctx.shopping.length) {
    lines.push(
      `## קניות\n${ctx.shopping.map((item) => `- ${item.id} ${item.title} x${item.quantity}${item.purchased_at ? " [bought]" : ""}`).join("\n")}`,
    );
  }
  if (ctx.checklists.length) {
    lines.push(
      `## רשימות\n${ctx.checklists
        .slice(0, 12)
        .map((list) => {
          const items = list.items
            .slice(0, 20)
            .map((item) => `  - ${item.id} ${item.checked ? "[x]" : "[ ]"} ${item.text}`)
            .join("\n");
          return `- ${list.id} ${list.title}\n${items}`;
        })
        .join("\n")}`,
    );
  }
  return lines.join("\n\n");
}
