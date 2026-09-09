import { z } from "zod";
import type { FirstScanAnalysis } from "./analyze";

const ScanDeadlineSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
    timezone: z.string().min(1).max(80),
    precision: z.enum(["date", "datetime"]),
  })
  .nullable();

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
        deadline: ScanDeadlineSchema.optional().nullable(),
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
  inventedRoutine: z.boolean().default(false),
  inventedDeadline: z.boolean().default(false),
  inventedResponsibility: z.boolean().default(false),
  inventedDuration: z.boolean().default(false),
});

export type SemanticScanResult = z.infer<typeof SemanticScanResultSchema>;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function canonicalizeTaskTiming(
  task: SemanticScanResult["proposedTasks"][number],
  timezone: string,
  invented: { routine: boolean; deadline: boolean },
): FirstScanAnalysis["proposedTasks"][number] {
  let recurrenceDays = invented.routine ? null : task.recurrenceDays;
  let dueAt = invented.deadline ? null : task.dueAt;
  let deadline = invented.deadline ? null : (task.deadline ?? null);

  if (dueAt && DATE_ONLY.test(dueAt)) {
    deadline = deadline ?? {
      date: dueAt,
      time: null,
      timezone,
      precision: "date",
    };
    dueAt = null;
  }

  if (deadline?.precision === "date") {
    dueAt = null;
    deadline = {
      ...deadline,
      time: null,
      timezone: deadline.timezone || timezone,
    };
  }

  if (
    !deadline &&
    dueAt &&
    !DATE_ONLY.test(dueAt) &&
    !Number.isNaN(Date.parse(dueAt))
  ) {
    deadline = {
      date: dueAt.slice(0, 10),
      time: null,
      timezone,
      precision: "datetime",
    };
  }

  return {
    title: task.title,
    categoryId:
      task.categoryId as FirstScanAnalysis["proposedTasks"][number]["categoryId"],
    detailTypeId: task.detailTypeId,
    homeAreaNames: task.homeAreaNames,
    dependsOnTitles: task.dependsOnTitles,
    relatedMemberNames: task.relatedMemberNames,
    recurrenceDays,
    dueAt,
    deadline,
  };
}

function applyInventionGuards(
  scan: SemanticScanResult,
  timezone: string,
): FirstScanAnalysis {
  return {
    detectedAreas: scan.detectedAreas,
    observations: scan.observations,
    proposedTasks: scan.proposedTasks.map((task) =>
      canonicalizeTaskTiming(task, timezone, {
        routine: scan.inventedRoutine,
        deadline: scan.inventedDeadline,
      }),
    ),
    profileFacts: scan.profileFacts,
    clarification: scan.clarification,
  };
}

/** Parse validated LLM scan JSON — no heuristic fallback. */
export function parseSemanticScanResult(
  semantic: unknown,
  opts?: { timezone?: string },
): FirstScanAnalysis {
  const parsed = SemanticScanResultSchema.safeParse(semantic);
  if (!parsed.success) {
    throw new Error("invalid semantic scan output");
  }
  return applyInventionGuards(parsed.data, opts?.timezone ?? "Asia/Jerusalem");
}
