import type { AppState, Task, HouseholdMember } from "@/lib/model";
import { dayKey, formatTime } from "@/lib/time";
import { activeFacts, whatMatters } from "@/lib/engine";
import { resolvePersonalAgentPolicy } from "@/lib/domain/agent-policy";

function stampLocal(iso: string | null | undefined, timezone: string) {
  if (!iso) return null;
  try {
    return formatTime(iso, timezone);
  } catch {
    return iso;
  }
}

function firstScanSummary(state: AppState) {
  const session = state.firstScan?.session;
  if (!session) return null;
  if (
    session.status !== "approved" &&
    session.status !== "completed" &&
    state.firstScan.status !== "completed"
  )
    return null;
  const draft = session.draftAnalysis as
    | {
        summary?: string;
        areas?: unknown[];
        members?: unknown[];
        observations?: unknown[];
      }
    | null
    | undefined;
  if (!draft || typeof draft !== "object") {
    return {
      status: state.firstScan.status,
      sessionStatus: session.status,
      chunkCount: session.chunks.length,
    };
  }
  return {
    status: state.firstScan.status,
    sessionStatus: session.status,
    summary:
      typeof draft.summary === "string" ? draft.summary.slice(0, 400) : null,
    areaCount: Array.isArray(draft.areas) ? draft.areas.length : 0,
    memberHints: Array.isArray(draft.members) ? draft.members.slice(0, 12) : [],
    observationCount: Array.isArray(draft.observations)
      ? draft.observations.length
      : 0,
  };
}

/** Bounded One-Brain context for the single personal agent. */
export function buildAgentContext(
  state: AppState,
  opts: {
    now?: Date;
    contextTaskId?: string | null;
    turnId?: string;
    messageLimit?: number;
  } = {},
) {
  const now = opts.now ?? new Date();
  const tz = state.profile.timezone;
  const activeTasks = state.tasks.filter(
    (t) =>
      t.status === "open" ||
      t.status === "unknown" ||
      t.status === "in_progress",
  );
  const plan =
    "plan" in state.planning
      ? (
          state.planning as {
            plan?: {
              date: string;
              availableMinutes: number;
              effort: number;
              items: {
                taskId: string;
                locked: boolean;
                planStatus: string;
              }[];
            } | null;
          }
        ).plan
      : null;

  const mapTask = (t: Task) => ({
    id: t.id,
    title: t.title,
    categoryId: t.categoryId,
    detailTypeId: t.detailTypeId,
    status: t.status,
    priority: t.priority,
    dueAtUtc: t.dueAt,
    dueAtLocal: stampLocal(t.dueAt, tz),
    preferredWindow: t.preferredWindow
      ? {
          startUtc: t.preferredWindow.start ?? null,
          endUtc: t.preferredWindow.end ?? null,
          startLocal: stampLocal(t.preferredWindow.start, tz),
          endLocal: stampLocal(t.preferredWindow.end, tz),
        }
      : null,
    hiddenUntil: t.hiddenUntil,
    relatedMemberIds: t.relatedMemberIds,
    homeAreaIds: t.homeAreaIds,
    workMinutes: t.workMinutes,
    waitMinutes: t.waitMinutes,
    classification: t.classification,
  });

  const members: Pick<HouseholdMember, "id" | "name" | "type" | "aliases">[] =
    state.members.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      aliases: m.aliases,
    }));

  const facts = activeFacts(state)
    .slice(-40)
    .map((f) => ({
      id: f.id,
      text: f.text,
      kind: f.kind,
      expiresAt: f.expiresAt,
    }));

  return {
    nowUtc: now.toISOString(),
    nowLocal: new Intl.DateTimeFormat("he-IL", {
      timeZone: tz,
      dateStyle: "short",
      timeStyle: "short",
    }).format(now),
    localDateKey: dayKey(now, tz),
    timezone: tz,
    agentPolicy: resolvePersonalAgentPolicy(state),
    profile: {
      name: state.profile.name,
      addressAs: state.profile.addressAs,
      timezone: tz,
      quietStart: state.profile.quietStart,
      quietEnd: state.profile.quietEnd,
      aiConsent: state.profile.aiConsent,
      autoApply: state.profile.autoApply,
      cleaner: state.profile.cleaner,
      householdRoutines: state.profile.householdRoutines,
      rooms: state.profile.rooms,
      children: state.profile.children,
      pets: state.profile.pets,
    },
    members,
    homeAreas: state.homeAreas.slice(0, 40).map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      parentAreaId: a.parentAreaId,
    })),
    tasks: activeTasks.slice(-80).map(mapTask),
    shopping: state.shopping.filter((x) => !x.purchasedAt).slice(-60),
    reminders: state.reminders
      .filter((r) => r.status === "pending")
      .slice(-60)
      .map((r) => ({
        id: r.id,
        title: r.title,
        dueAtUtc: r.dueAt,
        dueAtLocal: stampLocal(r.dueAt, tz),
        taskId: r.taskId,
        urgency: r.urgency ?? "medium",
      })),
    facts,
    compactedMemory: {
      facts: state.compactedMemory.facts.slice(-20),
      preferences: state.compactedMemory.preferences.slice(-20),
      patterns: state.compactedMemory.patterns.slice(-20),
      lifeAdminWindow: state.compactedMemory.lifeAdminWindow,
    },
    learning: state.learning.slice(-20).map((l) => ({
      id: l.id,
      kind: l.kind,
      key: l.key,
      confidence: l.confidence,
      samples: l.samples,
    })),
    firstScan: firstScanSummary(state),
    important: whatMatters(state).map((t) => t.id),
    contextTaskId: opts.contextTaskId ?? null,
    pendingAgentIntent: state.pendingAgentIntent ?? null,
    history: state.messages.slice(-(opts.messageLimit ?? 16)),
    turnId: opts.turnId,
    dailyPlan: plan
      ? {
          date: plan.date,
          availableMinutes: plan.availableMinutes,
          effort: plan.effort,
          plannedTaskIds: plan.items.map((i) => i.taskId),
          lockedTaskIds: plan.items
            .filter((i) => i.locked)
            .map((i) => i.taskId),
          completedPlanItems: plan.items
            .filter((i) => i.planStatus === "done")
            .map((i) => i.taskId),
        }
      : null,
    planningConstraint: state.planning.today,
  };
}

export function buildGroundedProposalSummary(actions: { type: string }[]) {
  const creates = actions.filter((a) => a.type === "task.create").length;
  if (creates === 1) return "זיהיתי משימה אחת. להוסיף אותה לרשימת המשימות?";
  if (creates > 1)
    return `זיהיתי ${creates} משימות. להוסיף אותן לרשימת המשימות?`;
  if (actions.some((a) => a.type === "reminder.add"))
    return "יש תזכורת שדורשת אישור לפני שמירה.";
  if (actions.length) return "יש פעולות שדורשות אישור לפני ביצוע.";
  return "אין פעולות לאישור.";
}
