import type { AppState, Task, HouseholdMember } from "@/lib/model";
import { dayKey, formatTime } from "@/lib/time";
import { activeFacts } from "@/lib/engine";
import { sanitizeWorkingMemory } from "@/lib/domain/working-memory";
import { buildAgentCapabilityContext } from "@/lib/agent/capabilities";
import { toRuntimePersonalAgentGuide } from "@/lib/domain/agent-guide";
import {
  recentCompletedTasks,
  shoppingFactualEvents,
  shoppingPurchaseHistory,
} from "@/lib/domain/factual-history";
import {
  checklistIndexEntry,
  PERSONAL_CHECKLIST_FULL_CONTEXT_LIMIT,
  PERSONAL_CHECKLIST_INDEX_LIMIT,
} from "@/lib/domain/checklists";

export type AgentSurfaceContext = {
  memoryKind?: "stable" | "temporary";
  memoryExpiresAt?: string | null;
};

function stampLocal(iso: string | null | undefined, timezone: string) {
  if (!iso) return null;
  try {
    return formatTime(iso, timezone);
  } catch {
    return iso;
  }
}

function firstScanKnowledge(state: AppState) {
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
        detectedAreas?: unknown[];
        areas?: unknown[];
        members?: unknown[];
        observations?: unknown[];
        profileFacts?: unknown[];
        proposedTasks?: unknown[];
        clarification?: unknown;
      }
    | null
    | undefined;

  if (!draft || typeof draft !== "object") {
    return {
      status: state.firstScan.status,
      sessionStatus: session.status,
      chunkCount: session.chunks.length,
      sourceChunks: session.chunks.slice(-12).map((c) => ({
        text: c.text.slice(0, 1000),
        source: c.source,
        createdAt: c.createdAt,
      })),
    };
  }

  const detectedAreas = Array.isArray(draft.detectedAreas)
    ? draft.detectedAreas
    : Array.isArray(draft.areas)
      ? draft.areas
      : [];

  return {
    status: state.firstScan.status,
    sessionStatus: session.status,
    summary:
      typeof draft.summary === "string" ? draft.summary.slice(0, 800) : null,
    detectedAreas: detectedAreas.slice(0, 30),
    members: Array.isArray(draft.members) ? draft.members.slice(0, 20) : [],
    observations: Array.isArray(draft.observations)
      ? draft.observations.slice(0, 30)
      : [],
    profileFacts: Array.isArray(draft.profileFacts)
      ? draft.profileFacts.slice(0, 30)
      : [],
    proposedTasks: Array.isArray(draft.proposedTasks)
      ? draft.proposedTasks.slice(0, 30)
      : [],
    sourceChunks: session.chunks.slice(-12).map((c) => ({
      text: c.text.slice(0, 1000),
      source: c.source,
      createdAt: c.createdAt,
    })),
  };
}

/**
 * Bounded One-Brain context for the single personal agent.
 * It contains what the application knows and what it can execute. It does not
 * contain an intent taxonomy or keyword rules for understanding the user.
 */
export function buildAgentContext(
  state: AppState,
  opts: {
    now?: Date;
    contextTaskId?: string | null;
    turnId?: string;
    messageLimit?: number;
    surface?: "chat" | "memory" | "planning";
    surfaceContext?: AgentSurfaceContext | null;
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
  const plan = state.planning.plan ?? null;

  const mapTask = (t: Task) => ({
    id: t.id,
    title: t.title,
    categoryId: t.categoryId,
    detailTypeId: t.detailTypeId,
    status: t.status,
    kind: t.kind,
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
    effort: t.effort,
    classification: t.classification,
    recurrenceDays: t.recurrenceDays,
    occurrenceOf: t.occurrenceOf,
    routineId: t.routineId,
    dependsOn: t.dependsOn,
    steps: t.steps.slice(0, 20),
    notes: t.notes.slice(0, 800),
  });

  const members: Pick<HouseholdMember, "id" | "name" | "type" | "aliases">[] =
    state.members.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      aliases: m.aliases,
    }));

  const facts = activeFacts(state, now)
    .slice(-60)
    .map((f) => ({
      id: f.id,
      text: f.text,
      kind: f.kind,
      expiresAt: f.expiresAt,
      source: f.source,
    }));

  const routines = state.routines.slice(-80).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    categoryId: r.categoryId,
    detailTypeId: r.detailTypeId,
    schedule: r.schedule,
    timeOfDay: r.timeOfDay,
    atTime: r.atTime,
    workMinutes: r.workMinutes,
    effort: r.effort,
    priority: r.priority,
    notes: r.notes.slice(0, 800),
    sourceFactId: r.sourceFactId,
    relatedMemberIds: r.relatedMemberIds,
    homeAreaIds: r.homeAreaIds,
    lastMaterializedDate: r.lastMaterializedDate,
  }));

  const profileKnowledge = {
    name: state.profile.name,
    addressAs: state.profile.addressAs,
    timezone: tz,
    rooms: state.profile.rooms,
    bathrooms: state.profile.bathrooms,
    children: state.profile.children,
    garden: state.profile.garden,
    pets: state.profile.pets,
    car: state.profile.car,
    dishwasher: state.profile.dishwasher,
    dryer: state.profile.dryer,
    cleaner: state.profile.cleaner,
    householdRoutines: state.profile.householdRoutines,
  };

  const homeAreas = state.homeAreas.slice(0, 60).map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    aliases: a.aliases,
    parentAreaId: a.parentAreaId,
    source: a.source,
  }));

  const learning = state.learning.slice(-30).map((l) => {
    if (l.kind !== "forecast") {
      return {
        id: l.id,
        kind: l.kind,
        key: l.key,
        payload: l.payload,
        confidence: l.confidence,
        samples: l.samples,
        lastObservedAt: l.lastObservedAt,
      };
    }
    return {
      id: l.id,
      kind: l.kind,
      key: l.key,
      payload: {
        events: Array.isArray(l.payload.events) ? l.payload.events : [],
        subject: l.payload.subject ?? null,
        lastEventAt: l.payload.lastEventAt ?? null,
      },
      samples: l.samples,
      lastObservedAt: l.lastObservedAt,
    };
  });

  const compactedMemory = {
    facts: state.compactedMemory.facts.slice(-30),
    preferences: state.compactedMemory.preferences.slice(-30),
    patterns: state.compactedMemory.patterns.slice(-30),
    lifeAdminWindow: state.compactedMemory.lifeAdminWindow,
  };

  const firstScan = firstScanKnowledge(state);
  const checklistIndex = state.checklists
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, PERSONAL_CHECKLIST_INDEX_LIMIT)
    .map(checklistIndexEntry);
  const personalChecklists = {
    presentation:
      state.checklists.length <= PERSONAL_CHECKLIST_FULL_CONTEXT_LIMIT
        ? ("full" as const)
        : ("index" as const),
    index: checklistIndex,
    full:
      state.checklists.length <= PERSONAL_CHECKLIST_FULL_CONTEXT_LIMIT
        ? state.checklists.map((row) => ({
            id: row.id,
            title: row.title,
            updatedAt: row.updatedAt,
            items: row.items
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((item) => ({
                id: item.id,
                text: item.text,
                checked: item.checked,
                order: item.order,
              })),
          }))
        : [],
  };

  return {
    nowUtc: now.toISOString(),
    nowLocal: new Intl.DateTimeFormat("he-IL", {
      timeZone: tz,
      dateStyle: "short",
      timeStyle: "short",
    }).format(now),
    localDateKey: dayKey(now, tz),
    timezone: tz,
    surface: opts.surface ?? "chat",
    surfaceContext: opts.surfaceContext ?? null,
    workingMemory: sanitizeWorkingMemory(state.agentWorkingMemory, now),
    /** Opaque per-user guide document — code does not interpret text. */
    personalAgentGuide: toRuntimePersonalAgentGuide(state),
    capabilityContract: buildAgentCapabilityContext(),
    userKnowledge: {
      profile: profileKnowledge,
      members,
      homeAreas,
      facts,
      routines,
      compactedMemory,
      learning,
      firstScan,
    },
    profile: profileKnowledge,
    members,
    homeAreas,
    routines,
    tasks: activeTasks.slice(-100).map(mapTask),
    shopping: state.shopping.filter((x) => !x.purchasedAt).slice(-80),
    shoppingHistory: shoppingPurchaseHistory(state, 80),
    shoppingEvents: shoppingFactualEvents(state, 80),
    recentCompletions: recentCompletedTasks(state, 40),
    personalChecklists,
    reminders: state.reminders
      .filter((r) => r.status === "pending")
      .slice(-80)
      .map((r) => ({
        id: r.id,
        title: r.title,
        dueAtUtc: r.dueAt,
        dueAtLocal: stampLocal(r.dueAt, tz),
        taskId: r.taskId,
        urgency: r.urgency ?? "medium",
        createdAt: r.createdAt ?? null,
      })),
    facts,
    compactedMemory,
    learning,
    firstScan,
    contextTaskId: opts.contextTaskId ?? null,
    history: state.messages.slice(-(opts.messageLimit ?? 20)),
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
  if (actions.some((a) => a.type === "routine.remove"))
    return "יש הסרת שגרה שדורשת אישור לפני ביצוע.";
  if (actions.some((a) => a.type === "checklist.create"))
    return "יש צ׳קליסט שדורש אישור לפני יצירה.";
  if (
    actions.some(
      (a) =>
        a.type.startsWith("checklist.") && a.type !== "checklist.item.toggle",
    )
  )
    return "יש שינוי בצ׳קליסט שדורש אישור לפני שמירה.";
  if (actions.length) return "יש פעולות שדורשות אישור לפני ביצוע.";
  return "אין פעולות לאישור.";
}
