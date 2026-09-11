import {
  AGENT_TURN_JSON_SCHEMA,
  claimsExecution,
  parseDecision,
} from "../action-schema.ts";

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

  constructor(
    status: number,
    code: "rate_limited" | "upstream_error" | "invalid_output",
  ) {
    super(code);
    this.status = status;
    this.code = code;
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

async function requestOnce(input: {
  apiKey: string;
  model: string;
  instructions: string;
  messages: AgentInputMessage[];
  fetchImpl: typeof fetch;
}) {
  const response = await input.fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
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
    return { decision: null, rawText: "" };
  }
  const rawText = extractOpenAIText(envelope);
  const decision = rawText ? parseDecision(rawText) : { ok: false as const };
  return { decision: decision.ok ? decision : null, rawText };
}

export async function requestAgentDecision(input: {
  apiKey: string;
  model: string;
  instructions: string;
  messages: AgentInputMessage[];
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const first = await requestOnce({ ...input, fetchImpl });
  if (first.decision) {
    return { decision: first.decision, recoveredReply: null, attempts: 1 };
  }

  const retry = await requestOnce({
    ...input,
    fetchImpl,
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
    return { decision: retry.decision, recoveredReply: null, attempts: 2 };
  }

  const recoveredReply =
    recoverSafeReply(retry.rawText) ?? recoverSafeReply(first.rawText);
  if (recoveredReply) {
    return { decision: null, recoveredReply, attempts: 2 };
  }
  throw new AgentUpstreamError(502, "invalid_output");
}
