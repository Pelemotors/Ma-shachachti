import { z } from "zod";
import type { FirstScanAnalysis } from "./analyze";
import { analyzeScanText } from "./analyze";

/**
 * Structured First Home Scan from semantic/LLM output.
 * Heuristic `analyzeScanText` remains offline fallback only.
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
  /** Never invent these — must stay null unless user was explicit. */
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
      categoryId: t.categoryId as FirstScanAnalysis["proposedTasks"][number]["categoryId"],
      detailTypeId: t.detailTypeId,
      homeAreaNames: t.homeAreaNames,
      dependsOnTitles: t.dependsOnTitles,
      relatedMemberNames: t.relatedMemberNames,
      // AI must not invent routine/deadline — force null unless schema already null.
      recurrenceDays: null,
      dueAt: null,
    })),
    profileFacts: scan.profileFacts,
    clarification: scan.clarification,
  };
}

/**
 * Prefer validated semantic AI result; fall back to heuristic text parser.
 */
export function analyzeFirstScan(
  text: string,
  opts: { semantic?: unknown; preferSemantic?: boolean } = {},
): FirstScanAnalysis {
  if (opts.preferSemantic !== false && opts.semantic != null) {
    const parsed = SemanticScanResultSchema.safeParse(opts.semantic);
    if (parsed.success) return stripInventions(parsed.data);
  }
  return analyzeScanText(text);
}
