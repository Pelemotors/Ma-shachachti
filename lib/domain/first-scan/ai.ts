import type { FirstScanAnalysis } from "./analyze";
import {
  parseSemanticScanResult,
  SemanticScanResultSchema,
} from "./semantic";

type OpenAIResponse = {
  status?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

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
 * Semantic First Home Scan via LLM.
 * Fail closed — no heuristic fallback when AI is unavailable or invalid.
 */
export async function analyzeFirstScanSemantic(
  text: string,
): Promise<{ analysis: FirstScanAnalysis; source: "semantic" }> {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || process.env.OPENAI_FALLBACK_MODEL;
  if (!key || !model) {
    throw new ScanAnalysisError(
      "ai_not_configured",
      "ניתוח סקירה דורש חיבור לסוכן.",
    );
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
            strict: false,
            schema: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
        max_output_tokens: 2500,
      }),
    });
    if (!response.ok) {
      throw new ScanAnalysisError(
        "scan_analysis_failed",
        "ניתוח הסקירה נכשל.",
      );
    }
    const data = (await response.json()) as OpenAIResponse;
    if (data.status !== "completed") {
      throw new ScanAnalysisError(
        "scan_analysis_failed",
        "ניתוח הסקירה לא הושלם.",
      );
    }
    const raw = outputText(data);
    const parsed = JSON.parse(raw) as unknown;
    if (!SemanticScanResultSchema.safeParse(parsed).success) {
      throw new ScanAnalysisError(
        "scan_analysis_failed",
        "פלט הסקירה לא תקין.",
      );
    }
    return { analysis: parseSemanticScanResult(parsed), source: "semantic" };
  } catch (error) {
    if (error instanceof ScanAnalysisError) throw error;
    throw new ScanAnalysisError(
      "scan_analysis_failed",
      "ניתוח הסקירה נכשל.",
    );
  }
}
