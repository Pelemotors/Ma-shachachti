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
  created_at: string;
  updated_at: string;
  completed_at: string | null;
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

export type AgentScheduleItem = {
  task_id: string;
  planned_start: string;
  planned_end: string | null;
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
  task_id: string;
  title: string;
  status: TaskStatus;
  planned_start: string;
  planned_end: string | null;
  fixed: boolean;
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
    };
