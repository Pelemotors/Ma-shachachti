/**
 * Focused live eval: task.create proposal contract (needs OPENAI_*).
 * Usage: node --import tsx scripts/agent-eval-task-create.ts
 */
import { readFileSync } from "node:fs";
import {
  parseAgentDecisionText,
  agentDecisionJsonSchema,
} from "../lib/agent/schema";
import { AGENT_INSTRUCTIONS } from "../lib/agent/instructions";

function loadEnvLocal() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* optional */
  }
}

const cases = [
  {
    id: "explicit_create",
    message: "תוסיף לי משימה לקבוע תור לרופא",
    expect: "proposal_create",
  },
  {
    id: "today_intent",
    message: "תוסיף ללוז של היום לפנות את המדיח",
    expect: "proposal_today",
  },
  {
    id: "ambiguous",
    message: "צריך לזכור ביטוח",
    expect: "clarify_or_proposal",
  },
  {
    id: "multi_create",
    message: "תוסיף להזמין אוכל לכלב ולקבוע תור לרופא",
    expect: "proposal_two",
  },
] as const;

async function callAgent(message: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL,
      store: false,
      instructions: AGENT_INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: JSON.stringify({
            context: {
              tasks: [],
              shopping: [],
              history: [],
              nowIso: new Date().toISOString(),
            },
            message,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "household_agent_decision",
          strict: false,
          schema: agentDecisionJsonSchema(),
        },
      },
      max_output_tokens: 2000,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
  }
  const text = (data.output ?? [])
    .flatMap(
      (x: { content?: { type: string; text?: string }[] }) => x.content ?? [],
    )
    .filter((x: { type: string }) => x.type === "output_text")
    .map((x: { text?: string }) => x.text ?? "")
    .join("\n");
  const isolated = parseAgentDecisionText(text);
  return isolated.decision;
}

function creates(decision: {
  proposal?: { proposedActions?: { type: string }[] } | null;
  explicitActions?: { type: string }[];
}) {
  const fromProposal =
    decision.proposal?.proposedActions?.filter((a) => a.type === "task.create")
      .length ?? 0;
  const fromExplicit =
    decision.explicitActions?.filter((a) => a.type === "task.create").length ??
    0;
  return { fromProposal, fromExplicit };
}

async function main() {
  loadEnvLocal();
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
    console.log(
      JSON.stringify({ status: "NOT_RUN", reason: "missing_openai" }),
    );
    return;
  }
  const results: Record<string, unknown>[] = [];
  let fail = 0;
  for (const c of cases) {
    try {
      const decision = await callAgent(c.message);
      const { fromProposal, fromExplicit } = creates(decision);
      const reply = decision.reply ?? "";
      const claimedSaved = /שמרתי|נשמרה|הוספתי|נוספה משימה/.test(reply);
      let ok = false;
      let detail = "";
      if (c.expect === "proposal_create") {
        ok = fromProposal >= 1 && fromExplicit === 0;
        detail = `creates=${fromProposal} explicitCreates=${fromExplicit}`;
      } else if (c.expect === "proposal_today") {
        ok =
          fromProposal >= 1 &&
          fromExplicit === 0 &&
          decision.affectsToday === true;
        detail = `creates=${fromProposal} affectsToday=${decision.affectsToday}`;
      } else if (c.expect === "clarify_or_proposal") {
        ok = Boolean(decision.clarification?.question) || fromProposal >= 1;
        detail = decision.clarification?.question
          ? `clarification`
          : `creates=${fromProposal}`;
      } else if (c.expect === "proposal_two") {
        ok = fromProposal >= 2 && fromExplicit === 0;
        detail = `creates=${fromProposal}`;
      }
      if (claimedSaved) ok = false;
      if (!ok) fail += 1;
      results.push({
        id: c.id,
        status: ok ? "PASS" : "FAIL",
        detail,
        affectsToday: decision.affectsToday,
        hasClarification: Boolean(decision.clarification),
      });
    } catch (e) {
      fail += 1;
      results.push({
        id: c.id,
        status: "FAIL",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  console.log(
    JSON.stringify(
      {
        status: fail ? "FAIL" : "PASS",
        fail,
        results,
      },
      null,
      2,
    ),
  );
  process.exit(fail ? 1 : 0);
}

void main();
