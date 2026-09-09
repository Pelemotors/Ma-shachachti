import type { Action, AppState, HomeArea } from "../../model";
import { normalize } from "../../model";
import { findSemanticDuplicate } from "../../engine";
import type { FirstScanAnalysis, ProposedScanTask } from "./analyze";

export type ScanApproveOptions = {
  scanSessionId: string;
  proposalId: string;
  turnId?: string;
};

export type ScanApproveResult = {
  actions: Action[];
  alreadyApplied: boolean;
};

function expandAreas(analysis: FirstScanAnalysis): {
  name: string;
  type: HomeArea["type"];
  aliases: string[];
}[] {
  const out: { name: string; type: HomeArea["type"]; aliases: string[] }[] = [];
  for (const a of analysis.detectedAreas) {
    if (a.type === "kids_room" && a.count != null && a.count >= 2) {
      for (let i = 1; i <= a.count; i++) {
        out.push({
          name: `חדר ילדים ${i}`,
          type: "kids_room",
          aliases: i === 1 ? ["חדרי ילדים", a.name] : [a.name],
        });
      }
    } else if (a.type === "kids_room" && a.count === 1) {
      out.push({
        name: "חדר ילדים",
        type: "kids_room",
        aliases: ["חדרי ילדים", a.name],
      });
    } else {
      out.push({ name: a.name, type: a.type, aliases: [] });
    }
  }
  return out;
}

function resolveAreaIds(
  names: string[],
  byName: Map<string, string>,
  areas: { name: string; type: HomeArea["type"] }[],
): string[] {
  const ids = new Set<string>();
  for (const name of names) {
    const direct = byName.get(normalize(name));
    if (direct) {
      ids.add(direct);
      continue;
    }
    if (/חדרי ילדים|חדר ילדים/.test(name)) {
      for (const a of areas) {
        if (a.type === "kids_room") {
          const id = byName.get(normalize(a.name));
          if (id) ids.add(id);
        }
      }
    }
  }
  return [...ids];
}

function findExistingArea(
  state: AppState,
  name: string,
  type: HomeArea["type"],
): HomeArea | undefined {
  const n = normalize(name);
  return state.homeAreas.find(
    (a) =>
      a.type === type &&
      (normalize(a.name) === n || a.aliases.some((x) => normalize(x) === n)),
  );
}

function preferScanOverStarter(
  existingTitle: string,
  scanTitle: string,
): string {
  // Scan-specific wording wins over generic starter labels.
  if (existingTitle.length <= scanTitle.length) return scanTitle;
  return scanTitle;
}

/**
 * Build approve actions for First/Quick Scan.
 * No business state changes until these actions are applied.
 * Idempotent for the same scanSessionId + proposalId.
 */
export function buildScanApproveActions(
  state: AppState,
  analysis: FirstScanAnalysis,
  opts: ScanApproveOptions,
): ScanApproveResult {
  const session = state.firstScan.session;
  if (
    session &&
    session.id === opts.scanSessionId &&
    session.proposalId === opts.proposalId &&
    (session.status === "approved" ||
      session.status === "completed" ||
      state.firstScan.status === "completed")
  ) {
    return { actions: [], alreadyApplied: true };
  }

  const actions: Action[] = [];
  const expanded = expandAreas(analysis);
  const areaIdByName = new Map<string, string>();
  const areaRows: { name: string; type: HomeArea["type"]; id: string }[] = [];

  for (const area of expanded) {
    const existing = findExistingArea(state, area.name, area.type);
    const id = existing?.id ?? crypto.randomUUID();
    areaIdByName.set(normalize(area.name), id);
    for (const alias of area.aliases) areaIdByName.set(normalize(alias), id);
    areaRows.push({ name: area.name, type: area.type, id });
    if (!existing) {
      actions.push({
        type: "homeArea.upsert",
        area: {
          id,
          name: area.name,
          type: area.type,
          aliases: area.aliases,
          parentAreaId: null,
          source: "scan",
        },
      });
    } else if (area.aliases.length) {
      const merged = [
        ...new Set([...existing.aliases, ...area.aliases, area.name]),
      ].filter((x) => normalize(x) !== normalize(existing.name));
      actions.push({
        type: "homeArea.upsert",
        area: {
          id: existing.id,
          name: existing.name,
          type: existing.type,
          aliases: merged,
          parentAreaId: existing.parentAreaId,
          source: existing.source === "user" ? "user" : "scan",
        },
      });
    }
  }

  // Soft member linking: match relatedMemberNames to household members.
  const memberIdByName = new Map(
    state.members.flatMap((m) => [
      [normalize(m.name), m.id] as const,
      ...m.aliases.map((a) => [normalize(a), m.id] as const),
    ]),
  );

  const titleToTaskId = new Map<string, string>();
  // Seed with existing open tasks for dependency resolution.
  for (const t of state.tasks) {
    if (t.status === "open" || t.status === "in_progress")
      titleToTaskId.set(normalize(t.title), t.id);
  }

  const createdTitles: ProposedScanTask[] = [];

  for (const proposed of analysis.proposedTasks) {
    const homeAreaIds = resolveAreaIds(
      proposed.homeAreaNames,
      areaIdByName,
      areaRows,
    );
    const relatedMemberIds = proposed.relatedMemberNames
      .map((n) => memberIdByName.get(normalize(n)))
      .filter((x): x is string => Boolean(x));

    const dup = findSemanticDuplicate(state, proposed.title, {
      categoryId: proposed.categoryId,
      detailTypeId: proposed.detailTypeId,
      dueAt: proposed.dueAt,
      homeAreaIds,
      memberIds: relatedMemberIds,
    });

    // Also check tasks we are about to create in this batch (same approve).
    const batchDupTitle = createdTitles.find((t) => {
      if (t.categoryId !== proposed.categoryId) return false;
      if (
        t.detailTypeId &&
        proposed.detailTypeId &&
        t.detailTypeId !== proposed.detailTypeId
      )
        return false;
      const sameAreas =
        t.homeAreaNames.length === 0 ||
        proposed.homeAreaNames.length === 0 ||
        t.homeAreaNames.some((n) => proposed.homeAreaNames.includes(n));
      if (!sameAreas) return false;
      return normalize(t.title) === normalize(proposed.title);
    });
    if (batchDupTitle) continue;

    if (dup) {
      // P35: scan-specific wording / areas override generic starter.
      const patchTitle = preferScanOverStarter(dup.title, proposed.title);
      actions.push({
        type: "task.update",
        id: dup.id,
        patch: {
          title: patchTitle,
          categoryId: proposed.categoryId,
          detailTypeId: proposed.detailTypeId ?? dup.detailTypeId,
          homeAreaIds:
            homeAreaIds.length > 0
              ? [...new Set([...dup.homeAreaIds, ...homeAreaIds])]
              : dup.homeAreaIds,
          relatedMemberIds:
            relatedMemberIds.length > 0
              ? [...new Set([...dup.relatedMemberIds, ...relatedMemberIds])]
              : dup.relatedMemberIds,
          recurrenceDays: proposed.recurrenceDays,
          dueAt: proposed.deadline?.precision === "date" ? null : proposed.dueAt,
          deadline: proposed.deadline ?? null,
        },
      });
      titleToTaskId.set(normalize(proposed.title), dup.id);
      titleToTaskId.set(normalize(patchTitle), dup.id);
      createdTitles.push(proposed);
      continue;
    }

    const id = crypto.randomUUID();
    const dependsOn = proposed.dependsOnTitles
      .map((title) => titleToTaskId.get(normalize(title)))
      .filter((x): x is string => Boolean(x));

    actions.push({
      type: "task.create",
      task: {
        id,
        title: proposed.title,
        kind: "task",
        categoryId: proposed.categoryId,
        detailTypeId: proposed.detailTypeId,
        homeAreaIds,
        relatedMemberIds,
        dependsOn,
        recurrenceDays: proposed.recurrenceDays,
        dueAt: proposed.deadline?.precision === "date" ? null : proposed.dueAt,
        deadline: proposed.deadline ?? null,
      },
    });
    titleToTaskId.set(normalize(proposed.title), id);
    createdTitles.push(proposed);
  }

  // Observations stay draft-only — never written as stable facts here (P20).

  const stamp = new Date().toISOString();
  // Keep firstScan.status in_progress until reset plan / "tasks only" (P37–P42).
  actions.push({
    type: "scan.set",
    firstScan: {
      status: "in_progress",
      completedAt: state.firstScan.completedAt ?? null,
      session: {
        id: opts.scanSessionId,
        status: "approved",
        chunks: session?.chunks ?? [],
        draftAnalysis: analysis,
        proposalId: opts.proposalId,
        createdAt: session?.createdAt ?? stamp,
        updatedAt: stamp,
      },
    },
  });

  if (opts.turnId) {
    actions.push({
      type: "operation.record",
      turnId: opts.turnId,
      summary: "אישור סקירת בית",
      actionTypes: [...new Set(actions.map((a) => a.type)), "scan.approve"],
    });
  }

  return { actions, alreadyApplied: false };
}

/** Shared entry for First Scan and later Quick Scan (P41). */
export { analyzeScanText, applyScanCorrection } from "./analyze";
