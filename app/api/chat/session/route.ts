import { authorize, HttpError } from "@/lib/server-auth";
import {
  createChatSession,
  latestOrCreateChatSession,
} from "@/lib/chat-sessions";

export const runtime = "nodejs";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Lean chat session error");
  return Response.json({ error: "לא הצלחנו לפתוח שיחה חדשה." }, { status: 500 });
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const session = await createChatSession(db, userId);
    if (!session) throw new HttpError(503, "לא הצלחנו לפתוח שיחה חדשה.");
    return Response.json({ session_id: session.id, created_at: session.created_at });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const session = await latestOrCreateChatSession(db, userId);
    if (!session) throw new HttpError(503, "לא הצלחנו לפתוח שיחה.");
    return Response.json({ session_id: session.id, created_at: session.created_at });
  } catch (error) {
    return jsonError(error);
  }
}
