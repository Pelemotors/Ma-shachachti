import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { authorize, HttpError } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type OpenAIResponse = {
  status?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

let cachedInstructions: string | null = null;

async function instructions() {
  if (!cachedInstructions) {
    cachedInstructions = await readFile(
      join(process.cwd(), "lib/agent/INSTRUCTIONS.he.md"),
      "utf8",
    );
  }
  return `${cachedInstructions}\n\n## מצב המוצר כרגע — Lean V1\nבשלב זה קיימת שיחה בלבד. אין לך עדיין כלים לשנות משימות, זיכרון, קניות, לו״ז או כל נתון אחר. אל תטען ששמרת, מחקת, עדכנת, תזמנת או ביצעת פעולה שאינה קיימת. אפשר לייעץ, לשאול, לחשוב ולשוחח כרגיל.`;
}

function extractText(data: OpenAIResponse) {
  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Lean chat error", error);
  return Response.json({ error: "הסוכן לא הצליח לענות כרגע. אפשר לנסות שוב." }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const { data, error } = await db
      .from("chat_messages")
      .select("id,role,content,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw new HttpError(503, "לא הצלחנו לטעון את השיחה.");
    return Response.json({ messages: (data ?? []) as StoredMessage[] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = await req.json().catch(() => null);
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) throw new HttpError(400, "ההודעה ריקה.");
    if (message.length > 8000) throw new HttpError(400, "ההודעה ארוכה מדי.");

    const { error: userSaveError } = await db.from("chat_messages").insert({
      user_id: userId,
      role: "user",
      content: message,
    });
    if (userSaveError) throw new HttpError(503, "לא הצלחנו לשמור את ההודעה.");

    const { data: recent, error: historyError } = await db
      .from("chat_messages")
      .select("role,content,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(24);
    if (historyError) throw new HttpError(503, "לא הצלחנו לטעון את ההקשר לשיחה.");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new HttpError(503, "חיבור ה-AI עדיין לא הוגדר.");
    const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model,
        store: false,
        instructions: await instructions(),
        input: (recent ?? [])
          .slice()
          .reverse()
          .map((item) => ({ role: item.role, content: item.content })),
        max_output_tokens: 1400,
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error("OpenAI Lean chat upstream error", { status: response.status, model });
      if (response.status === 429) throw new HttpError(503, "הסוכן עמוס כרגע. אפשר לנסות שוב בעוד רגע.");
      throw new HttpError(502, "לא הצלחנו לקבל תשובה מהסוכן.");
    }

    let data: OpenAIResponse;
    try {
      data = JSON.parse(raw) as OpenAIResponse;
    } catch {
      throw new HttpError(502, "הסוכן החזיר תשובה לא תקינה.");
    }

    const reply = extractText(data);
    if (!reply) throw new HttpError(502, "הסוכן לא החזיר תשובה.");

    const { data: saved, error: assistantSaveError } = await db
      .from("chat_messages")
      .insert({ user_id: userId, role: "assistant", content: reply })
      .select("id,created_at")
      .single();
    if (assistantSaveError || !saved) {
      throw new HttpError(503, "קיבלנו תשובה מהסוכן אבל לא הצלחנו לשמור אותה. אפשר לנסות שוב.");
    }

    return Response.json({ reply, id: saved.id, created_at: saved.created_at });
  } catch (error) {
    return jsonError(error);
  }
}
