/**
 * Live Capability Registry — doors the agent may choose among.
 * Not an intent taxonomy. Cached by buildVersion; rebuilt only when actions change.
 */
import {
  AGENT_CAPABILITY_CONTRACT,
  AGENT_CAPABILITY_TYPES,
  SAFE_AGENT_PROFILE_FIELDS,
  buildAgentCapabilityContext,
} from "@/lib/agent/capabilities";
import { createHash } from "node:crypto";

export type CapabilityEntry = {
  actionId: string;
  description: string;
  policy: "proposal" | "auto_or_proposal" | "auto";
  entityAffected: string;
  readWrite: "write" | "read";
  approvalRequired: boolean;
  destructive: boolean;
  notes: string;
};

export type CapabilityRegistrySnapshot = {
  capabilityVersion: string;
  buildVersion: string;
  actions: CapabilityEntry[];
  principle: string;
  categoryField: ReturnType<typeof buildAgentCapabilityContext>["categoryField"];
  safeProfileFields: readonly string[];
};

const BUILD_VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.DEPLOYMENT_VERSION ||
  process.env.npm_package_version ||
  "dev";

let cached: CapabilityRegistrySnapshot | null = null;

function deriveEntries(): CapabilityEntry[] {
  return AGENT_CAPABILITY_CONTRACT.map((c) => {
    const destructive =
      c.type.includes("remove") ||
      c.type.includes("cancel") ||
      c.policy === "proposal";
    const approvalRequired =
      c.policy === "proposal" || c.policy === "auto_or_proposal";
    const entityAffected = c.type.split(/[./]/)[0] ?? "unknown";
    return {
      actionId: c.type,
      description: c.purpose,
      policy: c.policy,
      entityAffected,
      readWrite: "write" as const,
      approvalRequired,
      destructive,
      notes: c.notes,
    };
  });
}

function computeVersion(actions: CapabilityEntry[]): string {
  const payload = JSON.stringify({
    types: AGENT_CAPABILITY_TYPES,
    actions: actions.map((a) => a.actionId),
    build: BUILD_VERSION,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/** Build once per process/build; reuse when capabilityVersion matches. */
export function getCapabilityRegistrySnapshot(
  forceRebuild = false,
): CapabilityRegistrySnapshot {
  if (cached && !forceRebuild) return cached;
  const actions = deriveEntries();
  const base = buildAgentCapabilityContext();
  cached = {
    capabilityVersion: computeVersion(actions),
    buildVersion: BUILD_VERSION,
    actions,
    principle: base.principle,
    categoryField: base.categoryField,
    safeProfileFields: SAFE_AGENT_PROFILE_FIELDS,
  };
  return cached;
}

export function capabilityRegistryCacheHit(): boolean {
  return cached != null;
}

/** Compact payload for the LLM — live registry, not a static prose dump only. */
export function buildLiveCapabilityContext() {
  const snap = getCapabilityRegistrySnapshot();
  return {
    capabilityVersion: snap.capabilityVersion,
    buildVersion: snap.buildVersion,
    principle: snap.principle,
    categoryField: snap.categoryField,
    safeProfileFields: snap.safeProfileFields,
    doors: snap.actions.map((a) => ({
      id: a.actionId,
      purpose: a.description,
      policy: a.policy,
      entity: a.entityAffected,
      approvalRequired: a.approvalRequired,
      destructive: a.destructive,
    })),
  };
}
