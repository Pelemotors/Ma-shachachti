export type TaskStatus = "open" | "done" | "cancelled";
export type MemoryKind = "preference" | "fact";
export type MemoryConfidence = "low" | "medium" | "high";
export type DuePatch = "keep" | "set" | "clear";
export type ReminderPatch = "keep" | "set";

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
  kind: MemoryKind | null;
  content: string | null;
  confidence: MemoryConfidence | null;
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
    }
  | {
      ok: false;
      type: ActionType | "invalid";
      error: string;
      detail?: string;
    };

export type AgentPresentation = {
  type: "task_list";
  task_ids: string[];
} | null;

export type PresentedTask = {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  due_on: string | null;
  due_at: string | null;
};

export type ClientPresentation = {
  type: "task_list";
  tasks: PresentedTask[];
};
