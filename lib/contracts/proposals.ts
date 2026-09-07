import { z } from "zod";
import { ActionSchema } from "../model";

export const ProposalRecordSchema = z.object({
  id: z.string().uuid(),
  summary: z.string(),
  proposedActions: z.array(ActionSchema),
  status: z.enum(["pending", "approved", "rejected", "expired"]),
  sourceRevision: z.number().int(),
  turnId: z.string().uuid().nullable().optional(),
});
