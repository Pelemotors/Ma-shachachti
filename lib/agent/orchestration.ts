import { ApiError } from "@/lib/server";
import {
  AgentDecision,
  AgentDecisionSchema,
  agentDecisionJsonSchema,
  parseAgentDecisionText,
  partitionActionsByPolicy,
} from "@/lib/agent/schema";
import { filterRunnableActions } from "@/lib/agent/action-validation";
import { enforceReferentialIntegrity } from "@/lib/agent/referential-integrity";
import { outputText, type OpenAIResponse } from "@/lib/agent/client";
import type { AppState } from "@/lib/model";
import {
  GLOBAL_AGENT_CONSTITUTION,
  AGENT_CONTRACT_VERSION,
} from "@/lib/agent/instructions";
import { RUNTIME_CAPABILITY_CONTRACT } from "@/lib/agent/runtime-contract";
import { buildGroundedProposalSummary } from "@/lib/domain/agent-context";
import { filterSafeDeferActions } from "@/lib/domain/tasks/deferrable";
import {
  buildAgentRuntimeContext,
  toAgentModelInput,
  type AgentRuntimeInstrumentation,
  type PendingProposalContext,
} from "@/lib/agent/runtime-context";
import { logAgentContextTrace } from "@/lib/agent/context-instrumentation";

function upstreamError(status: number, raw: string) {
  let code = "";
  try {
    code = JSON.parse(raw)?.error?.code ?? "";
  } catch {}
  if (status === 429 && code === "insufficient_quota")
    return new ApiError(
      503,
      "מכסת ה-AI הסתיימה כרגע. לא בוצעו שינויים; אפשר להמשיך ידנית או לנסות לאחר חידוש הקרדיט.",
      "ai_insufficient_quota",
    );
  if (status === 429)
    return new ApiError(
      429,
      "שירות ה-AI עמוס כרגע. לא בוצעו שינויים; אפשר לנסות שוב בעוד רגע.",
      "ai_rate_limited",
    );
  if (status === 401 || status === 403)
    return new ApiError(
      503,
      "חיבור ה-AI דורש תיקון בהגדרות השרת. לא בוצעו שינויים.",
      "ai_configuration",
    );
  return new ApiError(
    502,
    "הסוכן לא הצליח לענות כרגע. לא בוצעו שינויים; אפשר לנסות שוב.",
    "ai_upstream",
  );
}

async function callAgent(
  model: string,
  instructions: string,
  input: unknown,
): Promise<{
  decision: AgentDecision;
  model: string;
  rejectedActions: unknown[];
}> {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(18_000),
      body: JSON.stringify({
        model,
        store: false,
        instructions,
        input: [{ role: "user", content: JSON.stringify(input) }],
        text: {
          format: {
            type: "json_schema",
            name: "household_agent_decision",
            strict: false,
            schema: agentDecisionJsonSchema(),
          },
        },
        max_output_tokens: 3500,
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError")
      throw new ApiError(
        504,
        "הסוכן התעכב יותר מדי. לא בוצעו שינויים; אפשר לנסות שוב.",
        "ai_timeout",
      );
    throw new ApiError(
      502,
      "לא הצלחנו להגיע לשירות ה-AI. לא בוצעו שינויים.",
      "ai_network",
    );
  }

  const raw = await response.text();
  if (!response.ok) {
    console.error("OpenAI chat upstream error", {
      model,
      status: response.status,
    });
    throw upstreamError(response.status, raw);
  }

  let data: OpenAIResponse;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error("OpenAI response JSON parse failed", { model });
    throw new ApiError(
      502,
      "הסוכן החזיר תשובה לא תקינה. לא בוצעו שינויים.",
      "ai_invalid_json",
    );
  }
  if (data.status !== "completed")
    throw new ApiError(
      502,
      "התשובה לא הושלמה. לא בוצעו שינויים; אפשר לנסות שוב.",
      "ai_incomplete",
    );
  const text = outputText(data);
  if (!text)
    throw new ApiError(
      502,
      "הסוכן לא החזיר תשובה. לא בוצעו שינויים.",
      "ai_empty",
    );

  try {
    const isolated = parseAgentDecisionText(text);
    const decision = AgentDecisionSchema.parse(isolated.decision);
    return {
      decision,
      model,
      rejectedActions: isolated.rejectedActions,
    };
  } catch (error) {
    console.error("OpenAI agent payload parse failed", {
      model,
      error: error instanceof Error ? error.name : "unknown",
    });
    throw new ApiError(
      502,
      "הסוכן החזיר תשובה לא תקינה. לא בוצעו שינויים; אפשר לנסח שוב.",
      "ai_invalid_output",
    );
  }
}

export type ChatOrchestrationInput = {
  state: AppState;
  revision: number;
  message: string;
  contextTaskId: string | null;
  turnId: string;
  requestId: string;
  surface?: "chat" | "memory" | "planning";
  householdId?: string;
  pendingProposal?: PendingProposalContext;
  dbFetches?: string[];
};

export type ChatOrchestrationResult = {
  reply: string;
  explicitActions: AgentDecision["explicitActions"];
  actions: AgentDecision["explicitActions"];
  clarification: AgentDecision["clarification"];
  proposal: AgentDecision["proposal"];
  affectsToday: boolean;
  workingMemoryUpdate: AgentDecision["workingMemoryUpdate"];
  requestedTodayCreateIndexes?: number[];
  rejectedActionCount: number;
  basedOnRevision: number;
  requestId: string;
  turnId: string;
  selectedModel: string;
  agentContractVersion: string;
  instrumentation: AgentRuntimeInstrumentation;
};

export async function orchestrateChatTurn(
  input: ChatOrchestrationInput,
): Promise<ChatOrchestrationResult> {
  if (!input.state.profile.aiConsent)
    throw new ApiError(
      403,
      "אפשר להפעיל עזרה אישית בהגדרות, לאחר הסכמה לשימוש במידע.",
      "ai_consent_required",
    );
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL)
    throw new ApiError(
      503,
      "הסוכן עדיין לא מחובר. אפשר להוסיף ולנהל משימות ידנית.",
      "ai_not_configured",
    );

  const instructions = `${GLOBAL_AGENT_CONSTITUTION}${RUNTIME_CAPABILITY_CONTRACT}`;
  const now = new Date();
  const state = input.state;
  const runtime = buildAgentRuntimeContext({
    state,
    stateRevision: input.revision,
    householdId: input.householdId ?? "local",
    turnId: input.turnId,
    requestId: input.requestId,
    contextTaskId: input.contextTaskId,
    surface: input.surface ?? "chat",
    pendingProposal: input.pendingProposal ?? null,
    dbFetches: input.dbFetches ?? ["app_states"],
    now,
  });
  logAgentContextTrace({
    ...runtime.instrumentation,
    stage: "context_built",
  });
  const modelInput = toAgentModelInput(runtime, input.message);
  const models = Array.from(
    new Set(
      [process.env.OPENAI_MODEL, process.env.OPENAI_FALLBACK_MODEL].filter(
        Boolean,
      ),
    ),
  ) as string[];

  let decision: AgentDecision | null = null;
  let selectedModel = "";
  let rejectedFromParse: unknown[] = [];
  let lastError: unknown;
  for (const model of models) {
    try {
      const result = await callAgent(model, instructions, modelInput);
      decision = result.decision;
      selectedModel = result.model;
      rejectedFromParse = result.rejectedActions;
      break;
    } catch (error) {
      lastError = error;
      if (
        error instanceof ApiError &&
        (error.code === "ai_insufficient_quota" ||
          error.code === "ai_rate_limited" ||
          error.code === "ai_configuration")
      )
        throw error;
    }
  }
  if (!decision)
    throw (
      lastError ?? new ApiError(502, "הסוכן לא הצליח לענות כרגע.", "ai_failed")
    );

  // Domain checks references; it does not reinterpret what the user meant.
  decision = enforceReferentialIntegrity(state, decision);

  // Validate ordered lists against evolving temporary state.
  const explicitFiltered = filterRunnableActions(
    state,
    decision.explicitActions,
    now,
  );
  const deferGate = filterSafeDeferActions(
    state,
    explicitFiltered.accepted,
    now,
  );
  const proposalFiltered = filterRunnableActions(
    state,
    decision.proposal?.proposedActions ?? [],
    now,
  );
  const rejectedApply = [
    ...explicitFiltered.rejected,
    ...deferGate.rejected,
    ...proposalFiltered.rejected,
  ];

  decision = {
    ...decision,
    explicitActions: deferGate.accepted as typeof decision.explicitActions,
    proposal: decision.proposal
      ? {
          ...decision.proposal,
          proposedActions: proposalFiltered.accepted,
        }
      : null,
  };

  // Policy may promote explicit actions to a proposal. Never demote an action
  // the model intentionally kept inside a composed proposal: doing so can split
  // task.create + dependent reminder/update into an invalid half-executed turn.
  const { auto, proposal: policyProposal } = partitionActionsByPolicy(
    decision.explicitActions,
  );
  const fromModel = decision.proposal?.proposedActions ?? [];
  const allProposal = [...policyProposal, ...fromModel]
    .filter(
      (a, i, arr) =>
        arr.findIndex((x) => JSON.stringify(x) === JSON.stringify(a)) === i,
    )
    .slice(0, 20);
  const stillAuto = auto.filter(
    (a, i, arr) =>
      arr.findIndex((x) => JSON.stringify(x) === JSON.stringify(a)) === i,
  );

  const proposal =
    allProposal.length === 0
      ? null
      : {
          summary: buildGroundedProposalSummary(allProposal),
          reason: (allProposal.some((a) => a.type === "task.create")
            ? "new_tasks"
            : (decision.proposal?.reason ?? "other")) as NonNullable<
            AgentDecision["proposal"]
          >["reason"],
          proposedActions: allProposal,
        };

  decision = {
    ...decision,
    explicitActions: stillAuto,
    proposal,
  };

  const instrumentation = {
    ...runtime.instrumentation,
  };
  logAgentContextTrace({
    ...instrumentation,
    stage: "completed",
    model: selectedModel,
  });

  return {
    reply: decision.reply,
    explicitActions: decision.explicitActions,
    actions: decision.explicitActions,
    clarification: decision.clarification,
    proposal: decision.proposal,
    affectsToday: decision.affectsToday,
    workingMemoryUpdate: decision.workingMemoryUpdate ?? null,
    requestedTodayCreateIndexes: decision.requestedTodayCreateIndexes,
    rejectedActionCount: rejectedFromParse.length + rejectedApply.length,
    basedOnRevision: input.revision,
    requestId: input.requestId,
    turnId: input.turnId,
    selectedModel,
    agentContractVersion: AGENT_CONTRACT_VERSION,
    instrumentation,
  };
}
