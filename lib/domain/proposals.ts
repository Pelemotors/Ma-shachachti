import type { Action } from "../model";

export type ProposalStatus = "pending" | "approved" | "rejected" | "expired";

export type ProposalBase = {
  id: string;
  turnId: string | null;
  status: ProposalStatus;
  createdAt: string;
  expiresAt: string | null;
  sourceRevision: number;
};

export type ActionProposal = ProposalBase & {
  kind: "actions";
  summary: string;
  proposedActions: Action[];
};

export type ShoppingProposal = ProposalBase & {
  kind: "shopping";
  items: { title: string; quantity?: string }[];
};

export type PlanProposal = ProposalBase & {
  kind: "plan";
  summary: string;
  proposedActions: Action[];
};

export type Proposal = ActionProposal | ShoppingProposal | PlanProposal;
