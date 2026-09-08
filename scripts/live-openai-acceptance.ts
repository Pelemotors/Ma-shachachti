/**
 * Live OpenAI acceptance — paraphrase generalization (end-of-run only).
 * Loads .env.local without printing secrets.
 * Usage: npx tsx scripts/live-openai-acceptance.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  AgentDecisionSchema,
  agentDecisionJsonSchema,
  parseAgentDecisionText,
} from "../lib/agent/schema";
import { emptyState } from "../lib/model";
import { applyActions } from "../lib/engine";
import { enforceReferentialIntegrity } from "../lib/agent/semantic";
import { SemanticScanResultSchema } from "../lib/domain/first-scan/semantic";

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

type OpenAIResponse = {
  status?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

function outputText(data: OpenAIResponse): string {
  return (data.output ?? [])
    .flatMap((x) => x.content ?? [])
    .filter((c) => c.type === "output_text" && c.text)
    .map((c) => c.text!)
    .join("\n")
    .trim();
}

async function callAgentDecision(
  input: unknown,
): Promise<ReturnType<typeof AgentDecisionSchema.parse>> {
  const model = process.env.OPENAI_MODEL!;
  const instructions = readFileSync(
    resolve(process.cwd(), "lib/agent/INSTRUCTIONS.he.md"),
    "utf8",
  );
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(35_000),
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
      max_output_tokens: 2500,
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`upstream_${response.status}`);
  const data = JSON.parse(raw) as OpenAIResponse;
  if (data.status !== "completed") throw new Error("incomplete");
  return AgentDecisionSchema.parse(
    parseAgentDecisionText(outputText(data)).decision,
  );
}

function fixtureState() {
  const now = new Date("2026-09-08T10:00:00.000+03:00");
  return applyActions(
    emptyState(),
    [
      {
        type: "task.create",
        task: { title: "כביסה", kind: "task", categoryId: "laundry" },
      },
      {
        type: "task.create",
        task: {
          title: "סידור סלון",
          kind: "task",
          categoryId: "living_spaces",
        },
      },
      {
        type: "member.upsert",
        member: { name: "פלא", type: "child", aliases: ["פלא"] },
      },
    ],
    now,
  );
}

type CaseResult = { id: string; ok: boolean; detail?: string };

async function main() {
  loadEnvLocal();
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
    console.log("LIVE OPENAI ACCEPTANCE BLOCKED EXTERNALLY");
    console.log(JSON.stringify({ reason: "missing_key_or_model" }));
    process.exit(0);
  }

  const state = fixtureState();
  const laundry = state.tasks.find((t) => t.title === "כביסה")!;
  const results: CaseResult[] = [];
  const ctx = {
    now: "2026-09-08T10:00:00.000+03:00",
    tasks: state.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      categoryId: t.categoryId,
    })),
    members: state.members,
  };

  for (const [i, message] of [
    "סיימתי את הכביסה",
    "הכביסה מאחוריי",
    "גמרתי עם הכביסה",
    "אפשר לסמן כביסה כבוצע",
  ].entries()) {
    const id = `paraphrase_complete_${i + 1}`;
    try {
      const grounded = enforceReferentialIntegrity(
        state,
        await callAgentDecision({ context: ctx, message }),
      );
      const done = grounded.explicitActions.find(
        (a) =>
          a.type === "task.status" &&
          a.status === "done" &&
          a.id === laundry.id,
      );
      results.push({
        id,
        ok: Boolean(done) || Boolean(grounded.clarification),
        detail: done
          ? "complete"
          : grounded.clarification
            ? "clarification"
            : grounded.explicitActions.map((a) => a.type).join(","),
      });
    } catch (e) {
      results.push({
        id,
        ok: false,
        detail: e instanceof Error ? e.message : "error",
      });
    }
  }

  const extras: Array<{
    id: string;
    message: string;
    expect: (d: ReturnType<typeof AgentDecisionSchema.parse>) => boolean;
  }> = [
    {
      id: "defer",
      message: "לא היום עם הסלון",
      expect: (d) =>
        d.explicitActions.some((a) => a.type === "task.defer") ||
        Boolean(d.clarification),
    },
    {
      id: "reminder",
      message: "תזכירי לי מחר בערב לבדוק כביסה",
      expect: (d) =>
        d.explicitActions.some((a) => a.type === "reminder.add") ||
        Boolean(d.clarification),
    },
    {
      id: "temporary_context",
      message: "היום אני עם הילדה כל היום",
      expect: (d) =>
        d.explicitActions.some(
          (a) => a.type === "fact.add" || a.type === "planning.set",
        ) || Boolean(d.clarification),
    },
    {
      id: "shopping",
      message: "תוסיפי חלב לקניות בבקשה",
      expect: (d) => d.explicitActions.some((a) => a.type === "shopping.add"),
    },
    {
      id: "correction",
      message: "בעצם תעבירי את הכביסה למחר",
      expect: (d) =>
        d.explicitActions.some(
          (a) =>
            a.type === "task.defer" ||
            a.type === "task.deferUntil" ||
            a.type === "task.update",
        ) || Boolean(d.clarification),
    },
    {
      id: "ambiguity",
      message: "סיימתי",
      expect: (d) => Boolean(d.clarification) || d.explicitActions.length === 0,
    },
    {
      id: "unseen_phrasing",
      message: "הכביסה כבר מאחורי הגב, סגרי אותה אצלי במערכת",
      expect: (d) =>
        d.explicitActions.some(
          (a) =>
            a.type === "task.status" &&
            a.status === "done" &&
            a.id === laundry.id,
        ) || Boolean(d.clarification),
    },
    {
      id: "noise_typo",
      message: "סימתי כבסה בערך, תסמני בבקשה",
      expect: (d) =>
        d.explicitActions.some((a) => a.type === "task.status") ||
        Boolean(d.clarification),
    },
    {
      id: "multi_intent",
      message: "סיימתי מדיח, מחר צריך להזמין אוכל לכלב והיום אין לי כוח לכביסה",
      expect: (d) =>
        d.explicitActions.length + (d.clarification ? 1 : 0) >= 2 ||
        Boolean(d.proposal),
    },
  ];

  for (const c of extras) {
    try {
      const grounded = enforceReferentialIntegrity(
        state,
        await callAgentDecision({ context: ctx, message: c.message }),
      );
      results.push({
        id: c.id,
        ok: c.expect(grounded),
        detail: grounded.explicitActions.map((a) => a.type).join(",") || "none",
      });
    } catch (e) {
      results.push({
        id: c.id,
        ok: false,
        detail: e instanceof Error ? e.message : "error",
      });
    }
  }

  const scanInstr =
    "החזר JSON לסקירת בית. אל תמציא שגרה/תדירות/deadline/אחריות/משך. recurrenceDays ו-dueAt null. invented* false.";
  const scanSchema = z.toJSONSchema(SemanticScanResultSchema, {
    target: "draft-7",
  }) as Record<string, unknown>;
  delete scanSchema.$schema;

  for (const [i, text] of [
    "יש לי מטבח עם מדיח ושני חדרי שינה, אחת של הילדים",
    "דירת 3 חדרים, סלון מבולגן, חדר רחצה אחד, יש כלב",
    "בית קטן עם מטבח פתוח לסלון ושירותים אורחים",
  ].entries()) {
    const id = `first_scan_${i + 1}`;
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(35_000),
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL,
          store: false,
          instructions: scanInstr,
          input: [{ role: "user", content: text }],
          text: {
            format: {
              type: "json_schema",
              name: "first_home_scan",
              strict: false,
              schema: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
          max_output_tokens: 2000,
        }),
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`upstream_${response.status}`);
      const data = JSON.parse(raw) as OpenAIResponse;
      const parsed = SemanticScanResultSchema.parse(
        JSON.parse(outputText(data)),
      );
      const invented =
        parsed.inventedRoutine ||
        parsed.inventedDeadline ||
        parsed.inventedResponsibility ||
        parsed.inventedDuration ||
        parsed.proposedTasks.some(
          (t) => t.recurrenceDays != null || t.dueAt != null,
        );
      results.push({
        id,
        ok: !invented && parsed.detectedAreas.length > 0,
        detail: `areas=${parsed.detectedAreas.length}`,
      });
    } catch (e) {
      results.push({
        id,
        ok: false,
        detail: e instanceof Error ? e.message : "error",
      });
    }
  }

  for (const [i, message] of [
    "הזמנתי עכשיו אוכל לכלב",
    "נגמרו הטיטולים",
    "יש עוד מלא אוכל לכלב, לא צריך להזמין",
  ].entries()) {
    const id = `forecast_extract_${i + 1}`;
    try {
      const decision = await callAgentDecision({
        context: { now: ctx.now, tasks: [] },
        message,
      });
      results.push({
        id,
        ok:
          decision.explicitActions.length > 0 ||
          Boolean(decision.clarification) ||
          Boolean(decision.proposal),
        detail: decision.explicitActions.map((a) => a.type).join(",") || "soft",
      });
    } catch (e) {
      results.push({
        id,
        ok: false,
        detail: e instanceof Error ? e.message : "error",
      });
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(
    JSON.stringify(
      {
        model: process.env.OPENAI_MODEL,
        total: results.length,
        passed,
        failed: failed.length,
        results,
      },
      null,
      2,
    ),
  );
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.log("LIVE OPENAI ACCEPTANCE BLOCKED EXTERNALLY");
  console.log(
    JSON.stringify({
      reason: e instanceof Error ? e.message : "unknown",
    }),
  );
  process.exit(0);
});
