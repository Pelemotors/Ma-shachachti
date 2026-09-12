import type { SmithWorkItemStatus } from "./types.ts";

const transitions: Record<SmithWorkItemStatus, SmithWorkItemStatus[]> = {
  detected: ["investigating", "blocked"],
  investigating: ["building", "blocked", "failed"],
  building: ["testing", "blocked", "failed"],
  testing: ["building", "preview_ready", "failed"],
  preview_ready: ["building", "approval_requested", "superseded"],
  approval_requested: ["approved", "rejected", "superseded"],
  approved: ["deploying", "superseded"],
  deploying: ["deployed", "failed"],
  deployed: ["verification_failed"],
  rejected: ["building"],
  blocked: ["investigating"],
  failed: ["investigating"],
  superseded: [],
  verification_failed: ["rollback_ready"],
  rollback_ready: [],
};

export function canTransitionWorkItem(
  from: SmithWorkItemStatus,
  to: SmithWorkItemStatus,
) {
  return from === to || transitions[from].includes(to);
}

export function requireWorkItemTransition(
  from: SmithWorkItemStatus,
  to: SmithWorkItemStatus,
) {
  if (!canTransitionWorkItem(from, to)) {
    throw new Error(`Invalid Smith work-item transition: ${from} -> ${to}`);
  }
}
