import { authorize, readState, saveState, fail, jsonBody } from "@/lib/server";
import { StateSchema } from "@/lib/model";
import { z } from "zod";
export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    return Response.json(await readState(db, userId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return fail(e);
  }
}
// Full replacement is used only for explicit undo; ownership and revision are enforced in SQL.
export async function PUT(req: Request) {
  try {
    const { db } = await authorize(req);
    const b = z
      .object({ state: StateSchema, revision: z.number().int().min(0) })
      .parse(await jsonBody(req));
    const revision = await saveState(db, b.state, b.revision);
    return Response.json({ state: b.state, revision });
  } catch (e) {
    return fail(e);
  }
}
