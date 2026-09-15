import {
  AGENT_TURN_JSON_SCHEMA,
  claimsExecution,
  parseDecision,
} from "../action-schema.ts";
import {
  classifyAgentError,
  type AgentFailureCategory,
} from "./failure.ts";

type OpenAIResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

export type AgentInputMessage = {
  role: string;
  content: string;
};

export class AgentUpstreamError extends Error {
  readonly status: number;
  readonly code: "rate_limited" | "upstream_error" | "invalid_output";
  readonly category: AgentFailureCategory;

  constructor(
    status: number,
    code: "rate_limited" | "upstream_error" | "invalid_output",
    category?: AgentFailureCategory,
  ) {
    super(code);
    this.status = status;
    this.code = code;
    this.category =
      category ??
      (code === "rate_limited"
        ? "rate_limited"
        : code === "invalid_output"
          ? "schema_violation"
          : "transport");
  }
}

export function extractOpenAIText(data: OpenAIResponse) {
  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter(
      (part) => part.type === "output_text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function recoverSafeReply(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let reply = trimmed;
  try {
    const parsed = JSON.parse(trimmed) as { reply?: unknown };
    if (typeof parsed.reply !== "string") return null;
    reply = parsed.reply.trim();
  } catch {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return null;
  }
  return reply && !claimsExecution(reply) ? reply : null;
}

/** Default per-attempt timeout; total budget caps retries. */
export const AGENT_ATTEMPT_TIMEOUT_MS = 22_000;
export const AGENT_TOTAL_DEADLINE_MS = 45_000;

function remainingTimeoutMs(deadlineAt: number) {
  return Math.max(1_000, Math.min(AGENT_ATTEMPT_TIMEOUT_MS, deadlineAt - Date.now()));
}

async function requestOnce(input: {
  apiKey: string;
  model: string;
  instructions: string;
  messages: AgentInputMessage[];
  fetchImpl: typeof fetch;
  timeoutMs: number;
}) {
  let response: Response;
  try {
    response = await input.fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(input.timeoutMs),
      body: JSON.stringify({
        model: input.model,
        store: false,
        instructions: input.instructions,
        input: input.messages,
        max_output_tokens: 1400,
        text: {
          format: {
            type: "json_schema",
            name: "agent_turn",
            strict: true,
            schema: AGENT_TURN_JSON_SCHEMA,
          },
        },
      }),
    });
  } catch (error) {
    const category = classifyAgentError(error);
    throw new AgentUpstreamError(
      category === "timeout" ? 504 : 502,
      "upstream_error",
      category,
    );
  }

  if (!response.ok) {
    throw new AgentUpstreamError(
      response.status,
      response.status === 429 ? "rate_limited" : "upstream_error",
    );
  }

  let envelope: OpenAIResponse;
  try {
    envelope = (await response.json()) as OpenAIResponse;
  } catch {
    return {
      decision: null,
      rawText: "",
      parseCategory: "invalid_json" as AgentFailureCategory,
    };
  }
  const rawText = extractOpenAIText(envelope);
  if (!rawText) {
    return {
      decision: null,
      rawText: "",
      parseCategory: "empty_output" as AgentFailureCategory,
    };
  }
  const decision = parseDecision(rawText);
  return {
    decision: decision.ok ? decision : null,
    rawText,
    parseCategory: decision.ok
      ? null
      : ("schema_violation" as AgentFailureCategory),
  };
}

export async function requestAgentDecision(input: {
  apiKey: string;
  model: string;
  instructions: string;
  messages: AgentInputMessage[];
  fetchImpl?: typeof fetch;
  /** Absolute timestamp; defaults to now + AGENT_TOTAL_DEADLINE_MS */
  deadlineAt?: number;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const deadlineAt = input.deadlineAt ?? Date.now() + AGENT_TOTAL_DEADLINE_MS;

  const first = await requestOnce({
    ...input,
    fetchImpl,
    timeoutMs: remainingTimeoutMs(deadlineAt),
  });
  if (first.decision) {
    return {
      decision: first.decision,
      recoveredReply: null,
      attempts: 1,
      lastParseCategory: null as AgentFailureCategory | null,
    };
  }

  // At most one retry, and only if budget remains.
  if (deadlineAt - Date.now() < 3_000) {
    const recoveredReply = recoverSafeReply(first.rawText);
    if (recoveredReply) {
      return {
        decision: null,
        recoveredReply,
        attempts: 1,
        lastParseCategory: first.parseCategory,
      };
    }
    throw new AgentUpstreamError(
      502,
      "invalid_output",
      first.parseCategory ?? "schema_violation",
    );
  }

  const retry = await requestOnce({
    ...input,
    fetchImpl,
    timeoutMs: remainingTimeoutMs(deadlineAt),
    messages: [
      ...input.messages,
      {
        role: "user",
        content:
          "הפלט הקודם לא עבר את חוזה ה-JSON. החזר מחדש את אותה החלטה בלבד לפי הסכימה, בלי לשנות כוונה ובלי לטעון שבוצעה פעולה.",
      },
    ],
  });
  if (retry.decision) {
    return {
      decision: retry.decision,
      recoveredReply: null,
      attempts: 2,
      lastParseCategory: null as AgentFailureCategory | null,
    };
  }

  const recoveredReply =
    recoverSafeReply(retry.rawText) ?? recoverSafeReply(first.rawText);
  if (recoveredReply) {
    return {
      decision: null,
      recoveredReply,
      attempts: 2,
      lastParseCategory: retry.parseCategory ?? first.parseCategory,
    };
  }
  throw new AgentUpstreamError(
    502,
    "invalid_output",
    retry.parseCategory ?? first.parseCategory ?? "schema_violation",
  );
}
