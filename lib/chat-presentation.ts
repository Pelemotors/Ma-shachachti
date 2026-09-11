import { z } from "zod";
import { DATE_RE, TIME_RE } from "./time.ts";
import type { ClientPresentation } from "./types.ts";

const PresentedTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  notes: z.string(),
  status: z.enum(["open", "done", "cancelled"]),
  due_on: z.string().regex(DATE_RE).nullable(),
  due_at: z.string().nullable(),
}).strict();

export const StoredPresentationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("task_list"),
    tasks: z.array(PresentedTaskSchema).max(20),
  }).strict(),
  z.object({
    type: z.literal("schedule_plan"),
    date: z.string().regex(DATE_RE),
    saved: z.boolean(),
    items: z
      .array(
        z.object({
          task_id: z.string().uuid().nullable(),
          title: z.string(),
          status: z.enum(["open", "done", "cancelled", "proposed"]),
          planned_start: z.string().regex(TIME_RE),
          planned_end: z.string().regex(TIME_RE).nullable(),
          fixed: z.boolean(),
        }).strict(),
      )
      .max(20),
  }).strict(),
  z.object({
    type: z.literal("task_suggestions"),
    items: z
      .array(
        z.object({
          title: z.string(),
          reason: z.string().nullable(),
        }).strict(),
      )
      .max(8),
  }).strict(),
]);

export function validateStoredPresentation(
  value: unknown,
): ClientPresentation | null {
  if (value == null) return null;
  const parsed = StoredPresentationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
