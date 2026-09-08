import { ApiError } from "@/lib/server";
import { activeFacts, whatMatters } from "@/lib/engine";
import {
  AgentDecision,
  AgentDecisionSchema,
  agentDecisionJsonSchema,
  parseAgentDecisionText,
  partitionActionsByPolicy,
} from "@/lib/agent/schema";
import { filterRunnableActions } from "@/lib/agent/action-validation";
import { enforceReferentialIntegrity } from "@/lib/agent/semantic";
import { outputText, type OpenAIResponse } from "@/lib/agent/client";
import { nextDayStart } from "@/lib/time";
import type { AppState } from "@/lib/model";
import {
  AGENT_INSTRUCTIONS,
  AGENT_CONTRACT_VERSION,
} from "@/lib/agent/instructions";

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
      signal: AbortSignal.timeout(22_000),
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
};

export type ChatOrchestrationResult = {
  reply: string;
  explicitActions: AgentDecision["explicitActions"];
  actions: AgentDecision["explicitActions"];
  clarification: AgentDecision["clarification"];
  proposal: AgentDecision["proposal"];
  affectsToday: boolean;
  rejectedActionCount: number;
  basedOnRevision: number;
  requestId: string;
  turnId: string;
  selectedModel: string;
  agentContractVersion: string;
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

  const instructions = AGENT_INSTRUCTIONS;
  const now = new Date();
  const state = input.state;
  const activeTasks = state.tasks.filter(
    (t) =>
      t.status === "open" ||
      t.status === "unknown" ||
      (t.status as string) === "in_progress",
  );
  const plan =
    "plan" in state.planning
      ? (
          state.planning as {
            plan?: {
              date: string;
              availableMinutes: number;
              effort: number;
              items: {
                taskId: string;
                locked: boolean;
                planStatus: string;
              }[];
            } | null;
          }
        ).plan
      : null;
  const context = {
    now: now.toISOString(),
    endOfToday: nextDayStart(now, state.profile.timezone),
    profile: state.profile,
    facts: activeFacts(state),
    tasks: activeTasks.slice(-100),
    shopping: state.shopping.filter((x) => !x.purchasedAt).slice(-100),
    reminders: state.reminders
      .filter((r) => r.status === "pending")
      .slice(-100),
    important: whatMatters(state).map((t) => t.id),
    contextTaskId: input.contextTaskId,
    history: state.messages.slice(-12),
    turnId: input.turnId,
    dailyPlan: plan
      ? {
          date: plan.date,
          availableMinutes: plan.availableMinutes,
          effort: plan.effort,
          plannedTaskIds: plan.items.map((i) => i.taskId),
          lockedTaskIds: plan.items
            .filter((i) => i.locked)
            .map((i) => i.taskId),
          completedPlanItems: plan.items
            .filter((i) => i.planStatus === "done")
            .map((i) => i.taskId),
        }
      : null,
    planningConstraint: state.planning.today,
  };
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
      const result = await callAgent(model, instructions, {
        context,
        message: input.message,
      });
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

  decision = enforceReferentialIntegrity(state, decision);
  const explicitFiltered = filterRunnableActions(
    state,
    decision.explicitActions,
    now,
  );
  const proposalFiltered = filterRunnableActions(
    state,
    decision.proposal?.proposedActions ?? [],
    now,
  );
  const rejectedApply = [
    ...explicitFiltered.rejected,
    ...proposalFiltered.rejected,
  ];
  decision = {
    ...decision,
    explicitActions: explicitFiltered.accepted,
    proposal: decision.proposal
      ? {
          ...decision.proposal,
          proposedActions: proposalFiltered.accepted,
        }
      : null,
  };

  const { auto, proposal: policyProposal } = partitionActionsByPolicy(
    decision.explicitActions,
  );
  const fromModel = decision.proposal?.proposedActions ?? [];
  const { auto: modelAuto, proposal: modelProposal } =
    partitionActionsByPolicy(fromModel);
  const allProposal = [...policyProposal, ...modelProposal].slice(0, 20);
  const stillAuto = [...auto, ...modelAuto].filter(
    (a, i, arr) =>
      arr.findIndex((x) => JSON.stringify(x) === JSON.stringify(a)) === i,
  );

  let proposal =
    allProposal.length === 0
      ? null
      : {
          summary: (() => {
            const taskCreates = allProposal.filter(
              (a) => a.type === "task.create",
            );
            if (taskCreates.length === 1)
              return "זיהיתי משימה אחת. להוסיף אותה לרשימת המשימות?";
            if (taskCreates.length > 1)
              return `זיהיתי ${taskCreates.length} משימות. להוסיף אותן לרשימת המשימות?`;
            return (
              decision.proposal?.summary ??
              "יש פעולות שדורשות אישור לפני ביצוע."
            );
          })(),
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

  return {
    reply: decision.reply,
    explicitActions: decision.explicitActions,
    actions: decision.explicitActions,
    clarification: decision.clarification,
    proposal: decision.proposal,
    affectsToday: decision.affectsToday,
    rejectedActionCount: rejectedFromParse.length + rejectedApply.length,
    basedOnRevision: input.revision,
    requestId: input.requestId,
    turnId: input.turnId,
    selectedModel,
    agentContractVersion: AGENT_CONTRACT_VERSION,
  };
}
