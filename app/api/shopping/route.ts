import { authorize, HttpError } from "@/lib/server-auth";
import { loadShopping, mutateShopping, shoppingMutationSchema } from "@/lib/lists";

export const runtime = "nodejs";

function fail(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Lean shopping error");
  return Response.json({ error: "לא הצלחנו לעדכן את רשימת הקניות." }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    return Response.json({ shopping: await loadShopping(db, userId) });
  } catch (error) { return fail(error); }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const parsed = shoppingMutationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "פעולת הקניות אינה תקינה.");
    return Response.json({ shopping: await mutateShopping(db, userId, parsed.data) });
  } catch (error) { return fail(error); }
}
