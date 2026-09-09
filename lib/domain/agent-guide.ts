/**
 * Personal Agent Guide — opaque per-user document.
 * Domain validates ownership/revision/size only; never interprets text meaning.
 *
 * ## Source of Truth (do not confuse with history)
 *
 * - **Current guide (SoT):** `AppState.personalAgentGuide` inside `app_states.data`.
 *   Runtime / Agent context / deep access read ONLY this field.
 * - **In-state `personalAgentGuideHistory`:** bounded leftover field, no longer written.
 *   Not SoT. Not loaded into Runtime. Kept empty for schema EXPAND compatibility.
 * - **Durable audit table:** `personal_agent_guide_revisions` (best-effort append).
 *   Audit History only. NEVER read for Runtime or as current-guide SoT.
 */
import type { AppState } from "@/lib/model";

/** Technical max size for guide text (UTF-16 code units ≈ Zod string max). */
export const PERSONAL_AGENT_GUIDE_MAX_CHARS = 50_000;

export const PERSONAL_AGENT_GUIDE_HISTORY_MAX = 40;

export type PersonalAgentGuideDoc = {
  text: string;
  revision: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PersonalAgentGuideRevisionEntry = {
  revision: number;
  previousRevision: number;
  text: string;
  sourceTurnId: string | null;
  proposalId: string | null;
  createdAt: string;
};

export type RuntimePersonalAgentGuide = {
  exists: boolean;
  text: string;
  revision: number;
  createdAt: string | null;
  updatedAt: string | null;
  /** How to persist this document — not an interpretation of its text. */
  update: {
    actionId: "agentGuide.update";
    /** Current document revision to replace — copy as-is, do not add 1. */
    expectedRevision: number;
    currentRevision: number;
    placement: "proposal.proposedActions";
  };
};

function guideUpdateContract(expectedRevision: number) {
  return {
    actionId: "agentGuide.update" as const,
    expectedRevision,
    currentRevision: expectedRevision,
    placement: "proposal.proposedActions" as const,
  };
}

export function emptyRuntimePersonalAgentGuide(): RuntimePersonalAgentGuide {
  return {
    exists: false,
    text: "",
    revision: 0,
    createdAt: null,
    updatedAt: null,
    update: guideUpdateContract(0),
  };
}

export function toRuntimePersonalAgentGuide(
  state: AppState,
): RuntimePersonalAgentGuide {
  const g = state.personalAgentGuide;
  if (!g) return emptyRuntimePersonalAgentGuide();
  return {
    exists: true,
    text: g.text,
    revision: g.revision,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    update: guideUpdateContract(g.revision),
  };
}

export function guideRevisionFingerprint(state: AppState): string {
  const g = state.personalAgentGuide;
  if (!g) return "0:missing";
  return `${g.revision}:${g.updatedAt ?? ""}:${g.text.length}`;
}

export type ApplyAgentGuideUpdateInput = {
  expectedRevision: number;
  text: string;
  sourceTurnId?: string | null;
  proposalId?: string | null;
  now?: Date;
};

export type ApplyAgentGuideUpdateResult =
  | { ok: true; state: AppState; revisionEntry: PersonalAgentGuideRevisionEntry }
  | {
      ok: false;
      code:
        | "guide_empty"
        | "guide_too_large"
        | "guide_revision_conflict"
        | "guide_invalid_revision";
      message: string;
    };

/**
 * Pure domain apply for agentGuide.update.
 * Does not interpret guide text. Caller must only invoke after Approval.
 */
export function applyAgentGuideUpdate(
  state: AppState,
  input: ApplyAgentGuideUpdateInput,
): ApplyAgentGuideUpdateResult {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text)
    return {
      ok: false,
      code: "guide_empty",
      message: "מדריך הסוכן לא יכול להיות ריק.",
    };
  if (text.length > PERSONAL_AGENT_GUIDE_MAX_CHARS)
    return {
      ok: false,
      code: "guide_too_large",
      message: "מדריך הסוכן גדול מדי.",
    };

  if (
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  ) {
    return {
      ok: false,
      code: "guide_invalid_revision",
      message: "מספר גרסה לא תקין.",
    };
  }

  const current = state.personalAgentGuide;
  const currentRevision = current?.revision ?? 0;
  if (input.expectedRevision !== currentRevision) {
    return {
      ok: false,
      code: "guide_revision_conflict",
      message: "מדריך הסוכן השתנה. רעננו לפני שמירה.",
    };
  }

  const now = (input.now ?? new Date()).toISOString();
  const nextRevision = currentRevision + 1;
  const previousRevision = currentRevision;
  const createdAt = current?.createdAt ?? now;

  const revisionEntry: PersonalAgentGuideRevisionEntry = {
    revision: nextRevision,
    previousRevision,
    text,
    sourceTurnId: input.sourceTurnId ?? null,
    proposalId: input.proposalId ?? null,
    createdAt: now,
  };

  const nextGuide: PersonalAgentGuideDoc = {
    text,
    revision: nextRevision,
    createdAt,
    updatedAt: now,
  };

  return {
    ok: true,
    state: {
      ...state,
      personalAgentGuide: nextGuide,
      // Do not write in-state revision copies. Audit table is the history store.
      personalAgentGuideHistory: state.personalAgentGuideHistory ?? [],
    },
    revisionEntry,
  };
}

/** Legacy learning keys written by the old trait policy system. */
export const LEGACY_AGENT_POLICY_KEY_PREFIX = "agent_policy:";

export function listLegacyAgentPolicyLearning(state: AppState) {
  return state.learning.filter(
    (x) =>
      x.kind === "correction" &&
      typeof x.key === "string" &&
      x.key.startsWith(LEGACY_AGENT_POLICY_KEY_PREFIX),
  );
}
