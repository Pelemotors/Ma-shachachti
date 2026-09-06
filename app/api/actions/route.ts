import {
  authorize,
  readState,
  saveState,
  fail,
  jsonBody,
  ApiError,
} from "@/lib/server";
import { ActionBatch } from "@/lib/model";
import { applyActions } from "@/lib/engine";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = z
      .object({
        actions: ActionBatch,
        revision: z.number().int().min(0),
        confirmed: z.boolean().default(false),
      })
      .parse(await jsonBody(req));
    const current = await readState(db, userId);
    if (current.revision !== body.revision)
      throw new ApiError(409, "המידע השתנה בחלון אחר. יש לטעון מחדש.");
    let state;
    try {
      state = applyActions(
        current.state,
        body.actions,
        new Date(),
        body.confirmed,
      );
    } catch (e) {
      throw new ApiError(
        400,
        e instanceof Error ? e.message : "הפעולה לא תקינה.",
      );
    }
    const revision = await saveState(db, state, current.revision);
    return Response.json({ state, revision });
  } catch (e) {
    return fail(e);
  }
}
