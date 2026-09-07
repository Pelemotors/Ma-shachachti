import { z } from "zod";

export const StatePutRequestSchema = z.object({
  state: z.unknown(),
  revision: z.number().int().min(0),
});
