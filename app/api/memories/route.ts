import { z } from "zod";
import { authorize, HttpError } from "@/lib/server-auth";
import type { MemoryRow } from "@/lib/types";

export const runtime = "nodejs";

const memoryId = z.string().uuid();
const content = z.string().trim().min(1).max(500);
const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), content }).strict(),
  z.object({ action: z.literal("edit"), id: memoryId, content }).strict(),
  z.object({ action: z.literal("mark_seen"), ids: z.array(memoryId).min(1).max(40) }).strict(),
  z.object({ action: z.literal("delete"), id: memoryId }).strict(),
]);

const MEMORY_COLUMNS =
  "id,kind,content,confidence,source,seen_at,created_at,updated_at";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Lean memories API error");
  return Response.json({ error: "לא הצלחנו לעדכן את הזיכרונות." }, { status: 500 });
}

async function listMemories(
  db: Awaited<ReturnType<typeof authorize>>["db"],
  userId: string,
) {
  const { data, error } = await db
    .from("agent_memory")
    .select(MEMORY_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as MemoryRow[];
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    return Response.json({ memories: await listMemories(db, userId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const parsed = mutationSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new HttpError(400, "בקשת הזיכרון אינה תקינה.");
    }
    const now = new Date().toISOString();
    const action = parsed.data;
    if (action.action === "create") {
      const { error } = await db.from("agent_memory").insert({
        user_id: userId,
        kind: "preference",
        confidence: "medium",
        content: action.content,
        source: "user",
        seen_at: now,
        updated_at: now,
      });
      if (error) throw error;
    } else if (action.action === "edit") {
      const { data, error } = await db
        .from("agent_memory")
        .update({ content: action.content, source: "user", seen_at: now, updated_at: now })
        .eq("user_id", userId)
        .eq("id", action.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "הזיכרון לא נמצא.");
    } else if (action.action === "mark_seen") {
      const { error } = await db
        .from("agent_memory")
        .update({ seen_at: now })
        .eq("user_id", userId)
        .in("id", action.ids)
        .is("seen_at", null);
      if (error) throw error;
    } else {
      const { data, error } = await db
        .from("agent_memory")
        .delete()
        .eq("user_id", userId)
        .eq("id", action.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "הזיכרון לא נמצא.");
    }
    return Response.json({ memories: await listMemories(db, userId) });
  } catch (error) {
    return jsonError(error);
  }
}
