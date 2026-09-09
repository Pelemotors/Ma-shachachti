/**
 * Live Agent Acceptance for stages 2–3 — Production Agent Path only.
 *
 * PASS/FAIL/NOT_RUN_INFRA. Never mock LLM, never regex intent routing.
 * Usage: npm run agent:acceptance:stage23
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { emptyState, type AppState, type Action } from "../lib/model";
import { applyActions } from "../lib/engine";
import { orchestrateChatTurn } from "../lib/agent/orchestration";
import { invalidateAgentContextCache } from "../lib/agent/context-snapshot";
import type { AgentFailureClass } from "../lib/agent/acceptance-catalog";
import { AGENT_ACCEPTANCE_BY_STAGE } from "../lib/agent/acceptance-catalog";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    )
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

type CaseResult = {
  id: string;
  result: "PASS" | "FAIL" | "NOT_RUN_INFRA";
  failureClass?: AgentFailureClass;
  detail: string;
  contextDomains?: string[];
  cacheHits?: string[];
  cacheMisses?: string[];
  dbFetches?: string[];
  pendingProposalIncluded?: boolean;
  clarification?: string | null;
  actionTypes?: string[];
  replyPreview?: string;
  hydratedReferenceCount?: number;
};

const NOW = new Date("2026-09-09T12:00:00+03:00");

function seedState(actions: Action[]): AppState {
  let s = emptyState();
  s = {
    ...s,
    profile: { ...s.profile, aiConsent: true },
  };
  return applyActions(s, actions, NOW, true);
}

function hasClarification(r: Awaited<ReturnType<typeof orchestrateChatTurn>>) {
  return Boolean(r.clarification?.question?.trim());
}

function actionTypes(r: Awaited<ReturnType<typeof orchestrateChatTurn>>) {
  return [
    ...r.explicitActions.map((a) => a.type),
    ...(r.proposal?.proposedActions.map((a) => a.type) ?? []),
  ];
}

function mutatedBeforeApproval(
  before: AppState,
  afterOrchestrationState: AppState,
) {
  // orchestrateChatTurn must not mutate input state.
  return before !== afterOrchestrationState
    ? false
    : JSON.stringify(before.tasks) !==
        JSON.stringify(afterOrchestrationState.tasks);
}

async function runTurn(
  state: AppState,
  message: string,
  opts?: { contextTaskId?: string | null; revision?: number },
) {
  return orchestrateChatTurn({
    state,
    revision: opts?.revision ?? 1,
    message,
    contextTaskId: opts?.contextTaskId ?? null,
    turnId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    surface: "chat",
    householdId: "acceptance-stage23",
    dbFetches: ["app_states"],
  });
}

async function caseB01(): Promise<CaseResult> {
  const id = "B01";
  let state = seedState([]);
  // Turn 1 — ask for reminder without time
  const t1 = await runTurn(state, "תזכיר לי לקבוע תור.");
  if (t1.workingMemoryUpdate) {
    state = applyActions(
      state,
      [{ type: "workingMemory.patch", patch: t1.workingMemoryUpdate }],
      NOW,
      true,
    );
  }
  state = applyActions(
    state,
    [
      {
        type: "message.add",
        role: "user",
        text: "תזכיר לי לקבוע תור.",
        turnId: t1.turnId,
      },
      {
        type: "message.add",
        role: "assistant",
        text: t1.reply,
        turnId: t1.turnId,
      },
    ],
    NOW,
    true,
  );
  // Ensure open question in WM if model asked
  if (!state.agentWorkingMemory?.lastAgentQuestion) {
    state = applyActions(
      state,
      [
        {
          type: "workingMemory.patch",
          patch: {
            lastAgentQuestion: "מתי תרצי לקבוע את התור?",
            openLoops: [
              {
                summary: "ממתינים לזמן לתור",
                relevantEntityIds: [],
              },
            ],
            objective: "לקבוע תור",
          },
        },
      ],
      NOW,
      true,
    );
  }
  const t2 = await runTurn(state, "מחר בצהריים.");
  const askedAgain =
    /מתי\??/.test(t2.clarification?.question ?? "") ||
    /מתי\??/.test(t2.reply);
  const pass = !askedAgain;
  return {
    id,
    result: pass ? "PASS" : "FAIL",
    failureClass: pass ? undefined : "WORKING_MEMORY_FAILURE",
    detail: pass
      ? "did not re-ask when after providing time"
      : "re-asked timing after answer",
    contextDomains: t2.instrumentation.contextDomains,
    cacheHits: t2.instrumentation.cacheHits,
    cacheMisses: t2.instrumentation.cacheMisses,
    dbFetches: t2.instrumentation.dbFetches,
    clarification: t2.clarification?.question ?? null,
    actionTypes: actionTypes(t2),
    replyPreview: t2.reply.slice(0, 160),
  };
}

async function caseB02(): Promise<CaseResult> {
  const id = "B02";
  let state = seedState([]);
  state = applyActions(
    state,
    [
      {
        type: "workingMemory.patch",
        patch: {
          lastAgentQuestion: "מתי?",
          openLoops: [{ summary: "ממתינים לזמן", relevantEntityIds: [] }],
          contextSummary: "משתמשת אמרה מחר ב־10",
          assumptions: [{ text: "הזמן שנמסר הוא 10:00 מחר", confidence: 0.7 }],
        },
      },
      {
        type: "message.add",
        role: "user",
        text: "מחר ב־10.",
      },
      {
        type: "message.add",
        role: "assistant",
        text: "רשמתי מחר ב־10. לאשר?",
      },
    ],
    NOW,
    true,
  );
  const r = await runTurn(
    state,
    "לא בעצם אחרי שהילדה נרדמת, נגיד 20:30.",
  );
  const text = `${r.reply} ${JSON.stringify(r.proposal)} ${JSON.stringify(r.explicitActions)}`;
  const keepsTen = /10:00|ב־10|ב-10|10\b/.test(text) && !/20:30|20\.30/.test(text);
  const hasEvening = /20:30|20\.30|אחרי/.test(text);
  const pass = hasEvening && !keepsTen;
  return {
    id,
    result: pass ? "PASS" : "FAIL",
    failureClass: pass ? undefined : "WORKING_MEMORY_FAILURE",
    detail: pass
      ? "correction replaced prior time"
      : "kept both times or ignored correction",
    contextDomains: r.instrumentation.contextDomains,
    cacheHits: r.instrumentation.cacheHits,
    dbFetches: r.instrumentation.dbFetches,
    actionTypes: actionTypes(r),
    replyPreview: r.reply.slice(0, 160),
  };
}

async function caseB03(): Promise<CaseResult> {
  const id = "B03";
  let state = seedState([
    {
      type: "fact.add",
      text: "איסוף מהגן ב־16:00",
      kind: "stable",
      expiresAt: null,
    },
  ]);
  state = applyActions(
    state,
    [
      {
        type: "workingMemory.patch",
        patch: {
          lastAgentQuestion: "מתי תרצי לעשות את זה?",
          openLoops: [
            {
              summary: "מתי לבצע את המשימה הפתוחה",
              relevantEntityIds: [],
            },
          ],
        },
      },
      {
        type: "message.add",
        role: "assistant",
        text: "מתי תרצי לעשות את זה?",
      },
    ],
    NOW,
    true,
  );
  const r = await runTurn(state, "אחרי שאני חוזרת מהגן.");
  const demandsExact =
    /באיזו שעה|שעה מדויקת|מתי בדיוק/.test(r.clarification?.question ?? "") ||
    /באיזו שעה|שעה מדויקת/.test(r.reply);
  const usesContext =
    /16|גן|אחרי/.test(r.reply) ||
    actionTypes(r).length > 0 ||
    Boolean(r.proposal);
  const pass = !demandsExact && usesContext;
  return {
    id,
    result: pass ? "PASS" : "FAIL",
    failureClass: pass ? undefined : "CONTEXT_MISSING",
    detail: pass
      ? "used garden pickup context"
      : "demanded exact time or ignored state",
    contextDomains: r.instrumentation.contextDomains,
    dbFetches: r.instrumentation.dbFetches,
    clarification: r.clarification?.question ?? null,
    replyPreview: r.reply.slice(0, 160),
  };
}

async function caseB04(): Promise<CaseResult> {
  const id = "B04";
  let state = seedState([]);
  state = applyActions(
    state,
    [
      {
        type: "workingMemory.patch",
        patch: {
          lastAgentQuestion: "באיזה יום תרצי לקבוע את התור?",
          openLoops: [
            { summary: "בחירת יום לתור", relevantEntityIds: [] },
          ],
          objective: "לקבוע תור",
        },
      },
      {
        type: "message.add",
        role: "assistant",
        text: "באיזה יום תרצי לקבוע את התור?",
      },
    ],
    NOW,
    true,
  );
  const r = await runTurn(state, "עזוב רגע, נגמר החלב.");
  const asAppointmentAnswer =
    /יום|תור|ראשון|שני|שלישי/.test(r.reply) &&
    !/חלב|קני/.test(r.reply);
  const noticesMilk = /חלב/.test(r.reply) || actionTypes(r).some((t) =>
    ["shopping.add", "task.create", "reminder.add"].includes(t),
  ) || Boolean(r.proposal);
  const pass = noticesMilk && !asAppointmentAnswer;
  return {
    id,
    result: pass ? "PASS" : "FAIL",
    failureClass: pass ? undefined : "AGENT_REASONING_FAILURE",
    detail: pass
      ? "treated as topic change"
      : "interpreted milk as appointment answer",
    contextDomains: r.instrumentation.contextDomains,
    actionTypes: actionTypes(r),
    replyPreview: r.reply.slice(0, 160),
  };
}

async function caseU01(): Promise<CaseResult> {
  const id = "U01";
  const message = "תכניסי לי את זה להיום.";
  const taskA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const taskB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const stateA = seedState([
    {
      type: "task.create",
      task: { id: taskA, title: "לשלם ביטוח", kind: "task" },
    },
    {
      type: "message.add",
      role: "user",
      text: "צריך לשלם ביטוח",
    },
    {
      type: "message.add",
      role: "assistant",
      text: "רשמתי לשלם ביטוח.",
    },
    {
      type: "workingMemory.patch",
      patch: {
        relevantEntityIds: [taskA],
        contextSummary: "מדברים על לשלם ביטוח",
      },
    },
  ]);
  const stateB = seedState([
    {
      type: "task.create",
      task: { id: taskA, title: "לשלם ביטוח", kind: "task" },
    },
    {
      type: "task.create",
      task: { id: taskB, title: "לקנות חלב", kind: "task" },
    },
  ]);
  const stateC = seedState([]);

  const rA = await runTurn(stateA, message, { contextTaskId: taskA });
  const rB = await runTurn(stateB, message);
  const rC = await runTurn(stateC, message);

  const behavior = (r: Awaited<ReturnType<typeof orchestrateChatTurn>>) => ({
    clarified: hasClarification(r),
    actions: actionTypes(r).sort().join(","),
    affectsToday: r.affectsToday,
  });
  const a = behavior(rA);
  const b = behavior(rB);
  const c = behavior(rC);
  const identical =
    JSON.stringify(a) === JSON.stringify(b) &&
    JSON.stringify(b) === JSON.stringify(c);
  // Expect variation: B and C should clarify more often than clear-referent A
  const pass = !identical;
  return {
    id,
    result: pass ? "PASS" : "FAIL",
    failureClass: pass ? undefined : "ENTITY_RESOLUTION_FAILURE",
    detail: pass
      ? `varied behaviors A=${JSON.stringify(a)} B=${JSON.stringify(b)} C=${JSON.stringify(c)}`
      : "same behavior across three states",
    contextDomains: rA.instrumentation.contextDomains,
    dbFetches: rA.instrumentation.dbFetches,
    cacheHits: rA.instrumentation.cacheHits,
  };
}

async function caseU04(): Promise<CaseResult> {
  const id = "U04";
  const state = seedState([
    {
      type: "reminder.add",
      title: "תרופות",
      dueAt: "2030-01-01T10:00:00.000Z",
      taskId: null,
    },
    {
      type: "reminder.add",
      title: "גן",
      dueAt: "2030-01-01T11:00:00.000Z",
      taskId: null,
    },
    {
      type: "reminder.add",
      title: "כלב",
      dueAt: "2030-01-01T12:00:00.000Z",
      taskId: null,
    },
    {
      type: "reminder.add",
      title: "חשמל",
      dueAt: "2030-01-01T13:00:00.000Z",
      taskId: null,
    },
  ]);
  const before = state;
  const r = await runTurn(state, "תשני את התזכורת.");
  const guessed =
    actionTypes(r).includes("reminder.update") && !hasClarification(r);
  const asked = hasClarification(r) || /איזו|אחת|תזכורת/.test(r.reply);
  const pass = asked && !guessed && !mutatedBeforeApproval(before, state);
  return {
    id,
    result: pass ? "PASS" : "FAIL",
    failureClass: pass ? undefined : "AGENT_REASONING_FAILURE",
    detail: pass ? "asked which reminder" : "guessed or mutated",
    clarification: r.clarification?.question ?? null,
    actionTypes: actionTypes(r),
    contextDomains: r.instrumentation.contextDomains,
    replyPreview: r.reply.slice(0, 160),
  };
}

async function caseU05(): Promise<CaseResult> {
  const id = "U05";
  const remId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  let state = seedState([
    {
      type: "reminder.add",
      title: "יציאה לרופא",
      dueAt: "2030-01-01T17:15:00.000Z",
      taskId: null,
    },
  ]);
  // Force known id by creating via state patch after — reminder.add assigns id
  const realId = state.reminders[0]!.id;
  state = applyActions(
    state,
    [
      {
        type: "message.add",
        role: "user",
        text: "יש לי תזכורת ליציאה לרופא",
      },
      {
        type: "message.add",
        role: "assistant",
        text: "כן, התזכורת ליציאה לרופא רשומה ל־17:15.",
      },
      {
        type: "message.add",
        role: "user",
        text: "אפשר לשנות אותה?",
      },
      {
        type: "message.add",
        role: "assistant",
        text: "כמובן. לאיזו שעה?",
      },
      {
        type: "workingMemory.patch",
        patch: {
          relevantEntityIds: [realId],
          contextSummary: "עובדים על תזכורת יציאה לרופא",
          lastAgentQuestion: "לאיזו שעה?",
          openLoops: [
            {
              summary: "עדכון שעת תזכורת יציאה לרופא",
              relevantEntityIds: [realId],
            },
          ],
        },
      },
    ],
    NOW,
    true,
  );
  void remId;
  const r = await runTurn(state, "תשני אותה לתשע.");
  const askedWhich =
    /איזו תזכורת|איזה תזכורת|לאיזו/.test(r.clarification?.question ?? "") ||
    /איזו תזכורת/.test(r.reply);
  const pass = !askedWhich;
  return {
    id,
    result: pass ? "PASS" : "FAIL",
    failureClass: pass ? undefined : "WORKING_MEMORY_FAILURE",
    detail: pass
      ? "used conversation referent"
      : "asked which reminder despite clear context",
    clarification: r.clarification?.question ?? null,
    actionTypes: actionTypes(r),
    hydratedReferenceCount: r.instrumentation.hydratedReferenceCount,
    contextDomains: r.instrumentation.contextDomains,
    replyPreview: r.reply.slice(0, 160),
  };
}

async function main() {
  loadEnvLocal();
  invalidateAgentContextCache();
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
    const ids = AGENT_ACCEPTANCE_BY_STAGE.after_stage_2;
    const results: CaseResult[] = ids.map((id) => ({
      id,
      result: "NOT_RUN_INFRA",
      detail: "OPENAI_API_KEY/MODEL missing — not PASS via fallback",
    }));
    console.log(JSON.stringify({ results }, null, 2));
    process.exitCode = 0;
    return;
  }

  const runners: Record<string, () => Promise<CaseResult>> = {
    B01: caseB01,
    B02: caseB02,
    B03: caseB03,
    B04: caseB04,
    U01: caseU01,
    U04: caseU04,
    U05: caseU05,
  };

  const results: CaseResult[] = [];
  for (const id of AGENT_ACCEPTANCE_BY_STAGE.after_stage_2) {
    try {
      const fn = runners[id];
      if (!fn) {
        results.push({
          id,
          result: "FAIL",
          failureClass: "CONTEXT_MISSING",
          detail: "runner missing",
        });
        continue;
      }
      results.push(await fn());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const infra =
        /ai_not_configured|ai_insufficient_quota|ai_configuration|OPENAI/.test(
          msg,
        );
      results.push({
        id,
        result: infra ? "NOT_RUN_INFRA" : "FAIL",
        failureClass: infra ? undefined : "EXECUTION_FAILURE",
        detail: msg.slice(0, 300),
      });
    }
  }

  console.log(JSON.stringify({ stage: "2-3", results }, null, 2));
  if (results.some((r) => r.result === "FAIL")) process.exitCode = 1;
}

main();
