import { z } from "zod";
import { ActionSchema } from "../model";

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(6000),
  contextTaskId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().uuid().optional(),
  turnId: z.string().uuid().optional(),
});

export const ChatResponseSchema = z.object({
  reply: z.string(),
  actions: z.array(ActionSchema).default([]),
  explicitActions: z.array(ActionSchema).optional(),
  clarification: z
    .object({
      question: z.string(),
      unresolvedPart: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  proposal: z
    .object({
      summary: z.string(),
      proposedActions: z.array(ActionSchema),
    })
    .nullable()
    .optional(),
  basedOnRevision: z.number().int().optional(),
  turnId: z.string().uuid().optional(),
});
