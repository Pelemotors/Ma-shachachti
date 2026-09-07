/**
 * Live agent evaluation harness (optional; needs OPENAI_API_KEY).
 * Usage: npx tsx scripts/agent-eval.ts
 */
import { readFile } from "node:fs/promises";
import {
  parseAgentDecisionText,
  AgentDecisionSchema,
} from "../lib/agent/schema";

const cases = [
  { id: "single_task", message: "צריך לקפל כביסה" },
  {
    id: "multi_partial",
    message:
      "צריך להפעיל מדיח ולהזמין אוכל לכלב ואני לא יודעת מה לעשות עם הכביסה",
  },
  { id: "done_report", message: "סיימתי לפנות מדיח" },
  { id: "shopping_direct", message: "תוסיף חלב לקניות" },
  { id: "recipe_shopping", message: "תכין מתכון לילדה ותוציא רשימת קניות" },
  { id: "relative_time", message: "תזכיר לי היום בערב לבדוק כביסה" },
  { id: "free_time", message: "יש לי 20 דקות וקצת כוח" },
  { id: "replan", message: "הוספתי משימה דחופה, תעדכן את הלוז" },
];

async function main() {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
    console.log("SKIP: OPENAI credentials missing — structural eval only");
    for (const c of cases) {
      console.log(JSON.stringify({ id: c.id, status: "skipped" }));
    }
    return;
  }
  const instructions = await readFile(
    new URL("../lib/agent/INSTRUCTIONS.he.md", import.meta.url),
    "utf8",
  );
  const results = [];
  for (const c of cases) {
    const started = Date.now();
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL,
          store: false,
          instructions,
          input: [
            {
              role: "user",
              content: JSON.stringify({
                context: { tasks: [], shopping: [], history: [] },
                message: c.message,
              }),
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "household_agent_decision",
              strict: true,
              schema: { type: "object", additionalProperties: true },
            },
          },
          max_output_tokens: 2000,
        }),
      });
      const raw = await response.text();
      const data = JSON.parse(raw);
      const text = (data.output ?? [])
        .flatMap(
          (x: { content?: { type: string; text?: string }[] }) =>
            x.content ?? [],
        )
        .filter((x: { type: string }) => x.type === "output_text")
        .map((x: { text?: string }) => x.text ?? "")
        .join("");
      const isolated = parseAgentDecisionText(text);
      const decision = AgentDecisionSchema.parse(isolated.decision);
      results.push({
        id: c.id,
        reply_valid: Boolean(decision.reply),
        actions_valid: isolated.rejectedActions.length === 0,
        correct_actions: decision.explicitActions.length,
        unwanted_actions: isolated.rejectedActions.length,
        clarification_correct:
          c.id === "multi_partial" ? Boolean(decision.clarification) : true,
        latency: Date.now() - started,
      });
    } catch (e) {
      results.push({
        id: c.id,
        error: e instanceof Error ? e.message : "failed",
        latency: Date.now() - started,
      });
    }
  }
  console.log(JSON.stringify({ results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
