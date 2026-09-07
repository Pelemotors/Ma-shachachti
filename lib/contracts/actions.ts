import { z } from "zod";
import { ActionBatch } from "../model";

export const ActionsRequestSchema = z.object({
  actions: ActionBatch,
  confirmed: z.boolean().optional(),
  turnId: z.string().uuid().optional(),
  expectedRevision: z.number().int().optional(),
});
