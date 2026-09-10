export type TaskStatus = "open" | "done" | "cancelled";
export type MemoryKind = "preference" | "fact";
export type MemoryConfidence = "low" | "medium" | "high";
export type DuePatch = "keep" | "set" | "clear";
export type ReminderPatch = "keep" | "set";
export type PlanPatch = "keep" | "set" | "clear";

export type TaskRow = {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  due_on: string | null;
  due_at: string | null;
  reminder_offset_minutes: number | null;
  reminder_enabled: boolean;
  reminder_sent_at: string | null;
  reminder_claimed_at: string | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
  reschedule_count: number;
  last_rescheduled_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export const CONSEQUENCE_SEVERITIES = [
  "none",
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type ConsequenceSeverity = (typeof CONSEQUENCE_SEVERITIES)[number];

export const CONSEQUENCE_CONFIDENCES = ["low", "medium", "high"] as const;
export type ConsequenceConfidence = (typeof CONSEQUENCE_CONFIDENCES)[number];

export const CONSEQUENCE_BASIS_KINDS = [
  "explicit",
  "mixed",
  "inferred",
] as const;
export type ConsequenceBasisKind = (typeof CONSEQUENCE_BASIS_KINDS)[number];

export type ConsequenceBasis = {
  kind: ConsequenceBasisKind;
};

export type ConsequenceRow = {
  task_id: string;
  user_id: string;
  severity: ConsequenceSeverity;
  reason: string;
  confidence: ConsequenceConfidence;
  basis: ConsequenceBasis;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
};

export type ConsequenceUpdate = {
  task_id: string;
  severity: ConsequenceSeverity;
  reason: string;
  confidence: ConsequenceConfidence;
  basis: ConsequenceBasis;
  valid_until: string | null;
};

export type MemoryRow = {
  id: string;
  kind: MemoryKind;
  content: string;
  confidence: MemoryConfidence;
  created_at: string;
  updated_at: string;
};

export const ACTION_TYPES = [
  "task.create",
  "task.update",
  "task.complete",
  "task.reopen",
  "task.reschedule",
  "task.delete",
  "memory.upsert",
  "memory.remove",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export type AgentAction = {
  type: ActionType;
  id: string | null;
  title: string | null;
  notes: string | null;
  due_on: string | null;
  due_time: string | null;
  due_patch: DuePatch | null;
  reminder_enabled: boolean | null;
  reminder_offset_minutes: number | null;
  reminder_patch: ReminderPatch | null;
  plan_patch: PlanPatch | null;
  planned_date: string | null;
  planned_start_time: string | null;
  planned_end_time: string | null;
  kind: MemoryKind | null;
  content: string | null;
  confidence: MemoryConfidence | null;
  silent: boolean | null;
};

export type ActionResult =
  | {
      ok: true;
      type: ActionType;
      id?: string;
      title?: string | null;
      due_on?: string | null;
      due_time?: string | null;
      alreadyExists?: boolean;
      silent?: boolean;
    }
  | {
      ok: false;
      type: ActionType | "invalid";
      error: string;
      detail?: string;
    };

export type ScheduleAnchor = "fixed" | "planned";

export type AgentScheduleItem = {
  task_id: string | null;
  title: string | null;
  planned_start: string;
  planned_end: string | null;
  anchor: ScheduleAnchor | null;
};

export type AgentSuggestionItem = {
  title: string;
  reason: string | null;
};

export type AgentPresentation =
  | {
      type: "task_list";
      task_ids: string[];
    }
  | {
      type: "schedule_plan";
      date: string;
      items: AgentScheduleItem[];
    }
  | {
      type: "task_suggestions";
      items: AgentSuggestionItem[];
    }
  | null;

export type PresentedTask = {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  due_on: string | null;
  due_at: string | null;
};

export type PresentedScheduleItem = {
  task_id: string | null;
  title: string;
  status: TaskStatus | "proposed";
  planned_start: string;
  planned_end: string | null;
  fixed: boolean;
};

export type PresentedSuggestion = {
  title: string;
  reason: string | null;
};

export type ClientPresentation =
  | {
      type: "task_list";
      tasks: PresentedTask[];
    }
  | {
      type: "schedule_plan";
      date: string;
      saved: boolean;
      items: PresentedScheduleItem[];
    }
  | {
      type: "task_suggestions";
      items: PresentedSuggestion[];
    };
