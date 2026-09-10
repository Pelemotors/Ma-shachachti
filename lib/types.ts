export type TaskStatus = "open" | "done" | "cancelled";
export type MemoryKind = "preference" | "fact";
export type MemoryConfidence = "low" | "medium" | "high";

export type TaskRow = {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  due_on: string | null;
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
};

export type ClientPresentation = {
  type: "task_list";
  tasks: PresentedTask[];
};
