import { authorize, HttpError } from "@/lib/server-auth";
import { listChatSessions, SESSION_LIST_PAGE } from "@/lib/chat-sessions";

export const runtime = "nodejs";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Lean chat sessions list error");
  return Response.json({ error: "לא הצלחנו לטעון את השיחות." }, { status: 500 });
}

function pageSize(raw: string | null) {
  const value = Number(raw ?? SESSION_LIST_PAGE);
  if (!Number.isFinite(value)) return SESSION_LIST_PAGE;
  return Math.min(Math.max(Math.trunc(value), 1), SESSION_LIST_PAGE);
}

function pageOffset(raw: string | null) {
  const value = Number(raw ?? 0);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.trunc(value);
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const url = new URL(req.url);
    const listed = await listChatSessions(db, userId, {
      limit: pageSize(url.searchParams.get("limit")),
      offset: pageOffset(url.searchParams.get("offset")),
    });
    return Response.json(listed);
  } catch (error) {
    return jsonError(error);
  }
}
