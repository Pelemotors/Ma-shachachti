import { authorize, HttpError } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const [tasks, shopping, memories, profile] = await Promise.all([
      db.from("tasks").select("id,title,status,due_on,due_at").eq("user_id", userId),
      db.from("shopping_items").select("id,title,status").eq("user_id", userId),
      db.from("agent_memory").select("id,kind,content").eq("user_id", userId),
      db.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    return Response.json({
      userId,
      tasks: tasks.data ?? [],
      shopping: shopping.data ?? [],
      memories: memories.data ?? [],
      profile: profile.data ?? null,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "ייצוא הנתונים נכשל." }, { status: 500 });
  }
}
