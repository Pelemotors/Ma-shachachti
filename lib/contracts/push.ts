import { z } from "zod";

export const PushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z
    .object({
      p256dh: z.string().optional(),
      auth: z.string().optional(),
    })
    .passthrough(),
});
