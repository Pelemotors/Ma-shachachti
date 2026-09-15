import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inspectActions } from "../action-schema.ts";
import { loadMemory, loadTasks } from "../actions.ts";
import { loadConsequences } from "../consequences.ts";
import { loadChecklists, loadShopping } from "../lists.ts";
import { loadAgentProfile } from "../user-profile.ts";
import { createAgentProposal } from "../proposals.ts";
import { executeIdempotentActions } from "./idempotent-actions.ts";
import {
  AGENT_TOTAL_DEADLINE_MS,
  AgentUpstreamError,
  requestAgentDecision,
} from "./openai-orchestrator.ts";
import { buildCompactContext } from "./context/compact.ts";
import { buildAgentPrompt } from "./prompt-builder.ts";
import {
  fulfillContextRequests,
  parseContextRequests,
} from "./context/deep-access.ts";
import { todayContext } from "../time.ts";
import { latestOrCreateChatSession } from "../chat-sessions.ts";
import { recordActivity } from "../activity.ts";
import {
  claimAgentTurn,
  completeAgentTurn,
  failAgentTurn,
} from "./turn-receipts.ts";
import {
  classifyAgentError,
  logAgentFailure,
  type AgentFailureCategory,
} from "./failure.ts";
import {
  expandLearnedFollowUps,
  filterMemoryWritesForException,
  reconcileActions,
} from "./reconcile.ts";
import { selectLearnedActionRelations } from "./learned-relations.ts";

function brainDumpModeText() {
  try {
    return readFileSync(
      join(process.cwd(), "lib/agent/instructions/modes/brain-dump.md"),
      "utf8",
    ).trim();
  } catch {
    return "עבד תמלול Brain Dump לפעולות ברורות או proposal. אין תשובת צ׳אט.";
  }
}

export type BrainDumpStage =
  | "recorded"
  | "transcribed"
  | "interpreting"
  | "executing"
  | "partial_success"
  | "completed"
  | "failed";

export type BrainDumpResult = {
  recording_id: string;
  executed: number;
  proposal_id: string | null;
  summary: string;
  llm_calls: number;
  stage: BrainDumpStage;
  failure_category: AgentFailureCategory | null;
};

/**
 * Process a Brain Dump transcript asynchronously — no chat reply persisted.
 * Stages: transcribed → interpreting → executing → completed|partial_success|failed
 */
export async function processBrainDumpTranscript(input: {
  db: SupabaseClient;
  userId: string;
  recordingId: string;
  transcript: string;
  apiKey: string;
  model?: string;
}): Promise<BrainDumpResult> {
  const started = Date.now();
  const transcript = input.transcript.trim();
  if (!transcript) {
    return {
      recording_id: input.recordingId,
      executed: 0,
      proposal_id: null,
      summary: "תמלול ריק",
      llm_calls: 0,
      stage: "failed",
      failure_category: "empty_output",
    };
  }

  const session = await latestOrCreateChatSession(input.db, input.userId);
  if (!session) throw new Error("brain_dump_session_unavailable");

  const turnClaim = await claimAgentTurn(input.db, {
    userId: input.userId,
    sessionId: session.id,
    turnKey: input.recordingId,
  });
  if (turnClaim.kind === "completed") {
    const previous = turnClaim.response as Partial<BrainDumpResult>;
    return {
      recording_id: input.recordingId,
      executed: Number(previous.executed ?? 0),
      proposal_id:
        typeof previous.proposal_id === "string" ? previous.proposal_id : null,
      summary:
        typeof previous.summary === "string"
          ? previous.summary
          : "ההקלטה כבר עובדה",
      llm_calls: Number(previous.llm_calls ?? 0),
      stage:
        previous.stage === "partial_success" ||
        previous.stage === "completed" ||
        previous.stage === "failed"
          ? previous.stage
          : "completed",
      failure_category: null,
    };
  }
  if (turnClaim.kind === "processing") {
    return {
      recording_id: input.recordingId,
      executed: 0,
      proposal_id: null,
      summary: "העיבוד עדיין רץ",
      llm_calls: 0,
      stage: "interpreting",
      failure_category: null,
    };
  }

  let stage: BrainDumpStage = "interpreting";
  try {
    const [tasks, memory, profile, shopping, checklists] = await Promise.all([
      loadTasks(input.db, input.userId),
      loadMemory(input.db, input.userId),
      loadAgentProfile(input.db, input.userId),
      loadShopping(input.db, input.userId),
      loadChecklists(input.db, input.userId),
    ]);
    const consequenceMap = await loadConsequences(
      input.db,
      input.userId,
      tasks.filter((task) => task.status === "open").map((task) => task.id),
    );

    const compact = buildCompactContext({
      surface: null,
      surfaceContext: null,
      profile,
      currentTime: todayContext().currentTime,
      queryHint: transcript,
      allTasks: tasks,
      allMemory: memory,
      consequences: [...consequenceMap.values()],
      shopping,
      checklists,
      purpose: "brain-dump",
    });

    const base = buildAgentPrompt({ compact, surface: null });
    const instructions = `${base.instructions}

## הוראות Brain Dump
${brainDumpModeText()}
`;

    const model =
      input.model?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      "gpt-5.6-luna";
    const messages = [
      {
        role: "user",
        content: `Brain Dump transcript (לא שיחת צ׳אט):\n\n${transcript.slice(0, 6000)}`,
      },
    ];
    const deadlineAt = Date.now() + AGENT_TOTAL_DEADLINE_MS;

    let requested = await requestAgentDecision({
      apiKey: input.apiKey,
      model,
      instructions,
      messages,
      deadlineAt,
    });
    let llmCalls = requested.attempts;

    const requests = parseContextRequests(
      requested.decision && "context_requests" in requested.decision
        ? requested.decision.context_requests
        : [],
    );
    if (requested.decision?.ok && requests.length) {
      const appendix = await fulfillContextRequests({
        db: input.db,
        userId: input.userId,
        requests,
        alreadyTaskIds: new Set(compact.tasks.map((t) => t.id)),
        alreadyMemoryIds: new Set(compact.memories.map((m) => m.id)),
      });
      if (appendix && deadlineAt - Date.now() >= 5_000) {
        const second = await requestAgentDecision({
          apiKey: input.apiKey,
          model,
          instructions: `${instructions}\n\n## Deep Access — תוצאות\n${appendix}`,
          messages: [
            ...messages,
            {
              role: "user",
              content:
                "קיבלת Deep Access. ענה מחדש. אל תבקש עוד context_requests. אין תשובת צ׳אט.",
            },
          ],
          deadlineAt,
        });
        llmCalls += second.attempts;
        requested = second;
      }
    }

    const decision = requested.decision;
    if (!decision?.ok) {
      const category = requested.lastParseCategory ?? "schema_violation";
      logAgentFailure({
        category,
        turnId: input.recordingId,
        mode: "brain-dump",
        latencyMs: Date.now() - started,
        retryCount: llmCalls,
        model,
        reason: "interpretation_failed",
      });
      // Soft-fail: transcript remains on recording; turn fails so retry can reclaim.
      await failAgentTurn(input.db, input.userId, turnClaim.id);
      await recordActivity(input.db, {
        ownerId: input.userId,
        eventType: "ai.failure",
        metadata: {
          surface: "brain-dump",
          recordingId: input.recordingId,
          latencyMs: Date.now() - started,
          category,
          stage: "failed",
        },
      }).catch(() => undefined);
      return {
        recording_id: input.recordingId,
        executed: 0,
        proposal_id: null,
        summary: "לא הצלחנו לעבד את ההקלטה. התמלול נשמר — אפשר לנסות שוב.",
        llm_calls: llmCalls,
        stage: "failed",
        failure_category: category,
      };
    }

    stage = "executing";
    const inspected = inspectActions(decision.actions);
    const openTasks = tasks.filter((task) => task.status === "open");
    const relations = selectLearnedActionRelations(memory);
    let prepared = filterMemoryWritesForException({
      actions: inspected.accepted,
      userMessage: transcript,
    });
    prepared = expandLearnedFollowUps({
      actions: prepared,
      relations: relations.map((row) => ({
        trigger: row.trigger,
        followupTitle: row.followupTitle,
        ordering: row.ordering,
      })),
      openTasks,
      userMessage: transcript,
    });
    prepared = reconcileActions({
      actions: prepared,
      openTasks,
      shopping,
      userMessage: transcript,
    });
    // Clear items still execute even if some actions were rejected.
    const results = await executeIdempotentActions(input.db, {
      scope: "turn",
      scopeId: turnClaim.id,
      actions: prepared,
    });

    let proposalId: string | null = null;
    if (decision.proposal) {
      const proposal = await createAgentProposal(input.db, {
        userId: input.userId,
        sessionId: session.id,
        turnId: turnClaim.id,
        proposal: decision.proposal,
      });
      proposalId = proposal.id;
    }

    const executed = results.filter((row) => row.ok).length;
    const rejected = inspected.results.length;
    const partial =
      (executed > 0 && (Boolean(proposalId) || rejected > 0)) ||
      (executed > 0 && decision.proposal != null);
    stage =
      executed > 0 && (proposalId || rejected > 0)
        ? "partial_success"
        : executed > 0 || proposalId
          ? "completed"
          : proposalId
            ? "completed"
            : "completed";
    if (executed === 0 && !proposalId) {
      stage = "completed";
    } else if (partial || (executed > 0 && proposalId)) {
      stage = "partial_success";
    }

    const summary =
      decision.proposal?.summary ||
      (executed > 0
        ? `בוצעו ${executed} פעולות מההקלטה${proposalId ? " (יש גם פריטים לאישור)" : ""}`
        : proposalId
          ? "נשמרו פריטים לאישור מההקלטה"
          : "ההקלטה נשמרה; לא זוהו פעולות ברורות");

    const result: BrainDumpResult = {
      recording_id: input.recordingId,
      executed,
      proposal_id: proposalId,
      summary,
      llm_calls: llmCalls,
      stage,
      failure_category: null,
    };

    await completeAgentTurn(input.db, input.userId, turnClaim.id, {
      ...result,
      chatReply: false,
    });
    await recordActivity(input.db, {
      ownerId: input.userId,
      eventType: "ai.success",
      metadata: {
        surface: "brain-dump",
        recordingId: input.recordingId,
        latencyMs: Date.now() - started,
        llmCalls,
        executed: result.executed,
        proposal: Boolean(proposalId),
        stage,
        chatReply: false,
      },
    }).catch(() => undefined);

    return result;
  } catch (error) {
    const category =
      error instanceof AgentUpstreamError
        ? error.category
        : classifyAgentError(error);
    logAgentFailure({
      category,
      turnId: input.recordingId,
      mode: "brain-dump",
      latencyMs: Date.now() - started,
      reason: error instanceof Error ? error.message : "unknown",
    });
    await failAgentTurn(input.db, input.userId, turnClaim.id).catch(
      () => undefined,
    );
    // Soft-fail transport/timeout: keep HTTP success shape from route, transcript survives.
    if (error instanceof AgentUpstreamError) {
      await recordActivity(input.db, {
        ownerId: input.userId,
        eventType: "ai.failure",
        metadata: {
          surface: "brain-dump",
          recordingId: input.recordingId,
          latencyMs: Date.now() - started,
          category,
          stage: "failed",
        },
      }).catch(() => undefined);
      return {
        recording_id: input.recordingId,
        executed: 0,
        proposal_id: null,
        summary: "לא הצלחנו לעבד את ההקלטה. התמלול נשמר — אפשר לנסות שוב.",
        llm_calls: 0,
        stage: "failed",
        failure_category: category,
      };
    }
    throw error;
  }
}
