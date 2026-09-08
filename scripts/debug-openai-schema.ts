import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { agentDecisionJsonSchema } from "../lib/agent/schema";

for (const line of readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let val = m[2]!;
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  )
    val = val.slice(1, -1);
  if (!process.env[m[1]!]) process.env[m[1]!] = val;
}

const schema = agentDecisionJsonSchema();
const res = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL,
    store: false,
    instructions: "החזר JSON לפי הסכמה. עברית קצרה.",
    input: [
      {
        role: "user",
        content: JSON.stringify({
          message: "סיימתי כביסה",
          context: {
            tasks: [
              {
                id: "00000000-0000-4000-8000-000000000001",
                title: "כביסה",
                status: "open",
              },
            ],
          },
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "household_agent_decision",
        strict: true,
        schema,
      },
    },
    max_output_tokens: 800,
  }),
});
const raw = await res.text();
console.log("status", res.status);
// Redact any accidental key echo; print error body only.
console.log(raw.replace(/sk-[a-zA-Z0-9._-]+/g, "[redacted]").slice(0, 1200));
