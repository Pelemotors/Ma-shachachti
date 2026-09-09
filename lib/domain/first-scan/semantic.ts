import { z } from "zod";
import type { FirstScanAnalysis } from "./analyze";

/**
 * Structured First Home Scan from semantic/LLM output only.
 * Heuristic parsing lives in analyze.ts for migration/domain tests — not production.
 */
export const SemanticScanResultSchema = z.object({
  detectedAreas: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        type: z.enum([
          "bedroom",
          "bathroom",
          "kids_room",
          "living",
          "kitchen",
          "guest_toilet",
          "other",
        ]),
        count: z.number().int().min(0).nullable(),
        ambiguous: z.boolean(),
      }),
    )
    .max(40),
  observations: z.array(z.string().max(300)).max(40),
  proposedTasks: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        categoryId: z.string().min(1).max(80),
        detailTypeId: z.string().max(80).nullable(),
        homeAreaNames: z.array(z.string().max(80)).max(10),
        dependsOnTitles: z.array(z.string().max(120)).max(10),
        relatedMemberNames: z.array(z.string().max(80)).max(10),
        recurrenceDays: z.number().int().positive().nullable(),
        dueAt: z.string().nullable(),
        evidence: z.string().max(300).nullable().optional(),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .max(80),
  profileFacts: z.array(z.string().max(300)).max(40),
  members: z.array(z.string().max(80)).max(20).default([]),
  clarification: z
    .object({ question: z.string().min(1).max(300) })
    .nullable()
    .default(null),
  inventedRoutine: z.literal(false).default(false),
  inventedDeadline: z.literal(false).default(false),
  inventedResponsibility: z.literal(false).default(false),
  inventedDuration: z.literal(false).default(false),
});

export type SemanticScanResult = z.infer<typeof SemanticScanResultSchema>;

function stripInventions(scan: SemanticScanResult): FirstScanAnalysis {
  return {
    detectedAreas: scan.detectedAreas,
    observations: scan.observations,
    proposedTasks: scan.proposedTasks.map((t) => ({
      title: t.title,
      categoryId:
        t.categoryId as FirstScanAnalysis["proposedTasks"][number]["categoryId"],
      detailTypeId: t.detailTypeId,
      homeAreaNames: t.homeAreaNames,
      dependsOnTitles: t.dependsOnTitles,
      relatedMemberNames: t.relatedMemberNames,
      recurrenceDays: null,
      dueAt: null,
    })),
    profileFacts: scan.profileFacts,
    clarification: scan.clarification,
  };
}

/** Parse validated LLM scan JSON — no heuristic fallback. */
export function parseSemanticScanResult(semantic: unknown): FirstScanAnalysis {
  const parsed = SemanticScanResultSchema.safeParse(semantic);
  if (!parsed.success) {
    throw new Error("invalid semantic scan output");
  }
  return stripInventions(parsed.data);
}
