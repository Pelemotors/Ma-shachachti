import { z } from "zod";
import { ActionSchema } from "../model";
export const AgentActionSchema = ActionSchema.options.filter(
  (x) =>
    ![
      "profile.update",
      "history.clear",
      "message.add",
      "template.exclude",
      "template.restore",
    ].includes(x.shape.type.value),
);
export const AgentOutput = z.object({
  reply: z.string().min(1).max(4000),
  confidence: z.enum(["high", "clarify"]),
  actions: z
    .array(
      z.discriminatedUnion(
        "type",
        AgentActionSchema as [
          (typeof AgentActionSchema)[number],
          ...typeof AgentActionSchema,
        ],
      ),
    )
    .max(20),
});
