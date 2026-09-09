import type { Action, AppState } from "@/lib/model";
import {
  orchestrateChatTurn,
  type AgentModelCall,
  type ChatOrchestrationResult,
} from "@/lib/agent/orchestration";
import type { FirstScanAnalysis } from "./analyze";
import { parseSemanticScanResult } from "./semantic";
import {
  SCAN_SINGLE_PASS_CHARS,
  chunkScanText,
  type ScanTextChunk,
} from "./chunks";

export class ScanAnalysisError extends Error {
  code: "ai_not_configured" | "scan_analysis_failed";

  constructor(
    code: "ai_not_configured" | "scan_analysis_failed",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

function scanMessage(phase: "single" | "chunk" | "synthesize", index?: number) {
  if (phase === "chunk")
    return `סקירת בית ראשונה — חלק טכני ${typeof index === "number" ? index + 1 : ""}`.trim();
  if (phase === "synthesize") return "סקירת בית ראשונה — איחוד כל החלקים";
  return "סקירת בית ראשונה";
}

function parseDraft(raw: unknown, timezone: string): FirstScanAnalysis | null {
  if (raw == null) return null;
  try {
    return parseSemanticScanResult(raw, { timezone });
  } catch {
    return null;
  }
}

function analysisFromTypedActions(
  result: ChatOrchestrationResult,
  timezone: string,
): FirstScanAnalysis | null {
  const actions: Action[] = [
    ...(result.proposal?.proposedActions ?? []),
    ...(result.explicitActions ?? []),
  ];
  const creates = actions.filter(
    (action): action is Extract<Action, { type: "task.create" }> =>
      action.type === "task.create",
  );
  const areas = actions.filter(
    (action): action is Extract<Action, { type: "homeArea.upsert" }> =>
      action.type === "homeArea.upsert",
  );
  if (!creates.length && !areas.length) return null;
  return {
    detectedAreas: areas.map((action) => ({
      name: action.area.name,
      type: action.area.type,
      count: 1,
      ambiguous: false,
    })),
    observations: [],
    proposedTasks: creates.map((action) => {
      const deadline = action.task.deadline ?? null;
      return {
        title: action.task.title,
        categoryId: (action.task.categoryId ??
          "unclassified") as FirstScanAnalysis["proposedTasks"][number]["categoryId"],
        detailTypeId: action.task.detailTypeId ?? null,
        homeAreaNames: [],
        dependsOnTitles: [],
        relatedMemberNames: [],
        recurrenceDays: action.task.recurrenceDays ?? null,
        dueAt:
          deadline?.precision === "date" ? null : (action.task.dueAt ?? null),
        deadline: deadline
          ? {
              date: deadline.date,
              time: deadline.precision === "date" ? null : deadline.time,
              timezone: deadline.timezone || timezone,
              precision: deadline.precision,
            }
          : action.task.dueAt && /^\d{4}-\d{2}-\d{2}$/.test(action.task.dueAt)
            ? {
                date: action.task.dueAt,
                time: null,
                timezone,
                precision: "date" as const,
              }
            : null,
      };
    }),
    profileFacts: [],
    clarification: result.clarification
      ? { question: result.clarification.question }
      : null,
  };
}

function analysisFromAgentTurn(
  result: ChatOrchestrationResult,
  timezone: string,
): FirstScanAnalysis | null {
  return (
    parseDraft(result.scanDraft, timezone) ??
    analysisFromTypedActions(result, timezone)
  );
}

export async function analyzeFirstScanWithAgent(input: {
  text: string;
  state: AppState;
  revision?: number;
  turnId?: string;
  requestId?: string;
  householdId?: string;
  modelCall?: AgentModelCall;
}): Promise<{
  analysis: FirstScanAnalysis;
  source: "agent";
  chunks: ScanTextChunk[];
}> {
  const text = input.text;
  const chunks = chunkScanText(text);
  if (!chunks.length) {
    throw new ScanAnalysisError("scan_analysis_failed", "ניתוח הסקירה נכשל.");
  }

  const timezone = input.state.profile.timezone;
  const base = {
    state: input.state,
    revision: input.revision ?? 0,
    contextTaskId: null,
    requestId: input.requestId ?? crypto.randomUUID(),
    householdId: input.householdId ?? "local",
    surface: "first_scan" as const,
    modelCall: input.modelCall,
  };

  const run = async (
    phase: "single" | "chunk" | "synthesize",
    payloadChunks: ScanTextChunk[],
    evidence: unknown[],
    chunk?: ScanTextChunk,
  ) => {
    const turnId = crypto.randomUUID();
    return orchestrateChatTurn({
      ...base,
      message: scanMessage(phase, chunk?.index),
      turnId: input.turnId ?? turnId,
      requestId: `${base.requestId}:${phase}:${chunk?.index ?? "all"}`,
      scanInput: {
        phase,
        chunks: payloadChunks,
        chunkId: chunk?.id ?? null,
        evidence,
      },
    });
  };

  try {
    if (text.length <= SCAN_SINGLE_PASS_CHARS || chunks.length === 1) {
      const result = await run("single", chunks, []);
      const analysis = analysisFromAgentTurn(result, timezone);
      if (!analysis) {
        throw new ScanAnalysisError(
          "scan_analysis_failed",
          "פלט הסקירה לא תקין.",
        );
      }
      return { analysis, source: "agent", chunks };
    }

    const evidence: unknown[] = [];
    for (const chunk of chunks) {
      const part = await run("chunk", [chunk], evidence, chunk);
      const draft = parseDraft(part.scanDraft, timezone);
      evidence.push(
        draft ?? {
          chunkId: chunk.id,
          index: chunk.index,
          offset: chunk.offset,
          reply: part.reply,
        },
      );
    }

    const final = await run("synthesize", chunks, evidence);
    const analysis = analysisFromAgentTurn(final, timezone);
    if (!analysis) {
      throw new ScanAnalysisError(
        "scan_analysis_failed",
        "פלט הסקירה לא תקין.",
      );
    }
    return { analysis, source: "agent", chunks };
  } catch (error) {
    if (error instanceof ScanAnalysisError) throw error;
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (code === "ai_not_configured" || code === "ai_consent_required") {
      throw new ScanAnalysisError(
        "ai_not_configured",
        "ניתוח סקירה דורש חיבור לסוכן.",
      );
    }
    throw new ScanAnalysisError("scan_analysis_failed", "ניתוח הסקירה נכשל.");
  }
}
