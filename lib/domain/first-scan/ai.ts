import { z } from "zod";
import { SemanticScanResultSchema, analyzeFirstScan } from "./semantic";
import type { FirstScanAnalysis } from "./analyze";

function scanJsonSchema() {
  const base = z.toJSONSchema(SemanticScanResultSchema, {
    target: "draft-7",
  }) as Record<string, unknown>;
  delete base.$schema;
  return base;
}

type OpenAIResponse = {
  status?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

function outputText(data: OpenAIResponse): string {
  const texts: string[] = [];
  for (const item of data.output ?? []) {
    for (const c of item.content ?? []) {
      if (c.type === "output_text" && c.text) texts.push(c.text);
    }
  }
  return texts.join("\n").trim();
}

const SCAN_INSTRUCTIONS = `אתה מנתח סקירת בית ראשונה בעברית.
החזר JSON מובנה בלבד לפי הסכמה.
זהה רק מה שנאמר במפורש או משתמע בבירור מהתיאור.
אל תמציא שגרה, תדירות, deadline, אחריות או משך.
recurrenceDays ו-dueAt חייבים להיות null אלא אם המשתמשת אמרה במפורש.
inventedRoutine/Deadline/Responsibility/Duration חייבים להיות false.
אם חסר מידע קריטי — מלא clarification.question קצר.`;

/**
 * Semantic First Home Scan via LLM when key+model available.
 * Always falls back to heuristic analyzeFirstScan on failure/invalid output.
 */
export async function analyzeFirstScanSemantic(
  text: string,
): Promise<{ analysis: FirstScanAnalysis; source: "semantic" | "heuristic" }> {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || process.env.OPENAI_FALLBACK_MODEL;
  if (!key || !model) {
    return { analysis: analyzeFirstScan(text), source: "heuristic" };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(22_000),
      body: JSON.stringify({
        model,
        store: false,
        instructions: SCAN_INSTRUCTIONS,
        input: [{ role: "user", content: text.slice(0, 8000) }],
        text: {
          format: {
            type: "json_schema",
            name: "first_home_scan",
            strict: true,
            schema: scanJsonSchema(),
          },
        },
        max_output_tokens: 2500,
      }),
    });
    if (!response.ok) {
      return { analysis: analyzeFirstScan(text), source: "heuristic" };
    }
    const data = (await response.json()) as OpenAIResponse;
    if (data.status !== "completed") {
      return { analysis: analyzeFirstScan(text), source: "heuristic" };
    }
    const raw = outputText(data);
    const parsed = JSON.parse(raw) as unknown;
    const analysis = analyzeFirstScan(text, { semantic: parsed });
    const ok = SemanticScanResultSchema.safeParse(parsed).success;
    return { analysis, source: ok ? "semantic" : "heuristic" };
  } catch {
    return { analysis: analyzeFirstScan(text), source: "heuristic" };
  }
}
