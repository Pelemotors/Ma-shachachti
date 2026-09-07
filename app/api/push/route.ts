import { z } from "zod";
import { authorize, fail, ApiError, jsonBody } from "@/lib/server";
import { validPushEndpoint } from "@/lib/push";
const Subscription = z.object({
  endpoint: z.string().max(2000).refine(validPushEndpoint),
  keys: z.object({
    p256dh: z.string().min(20).max(200),
    auth: z.string().min(10).max(200),
  }),
});
export async function GET(req: Request) {
  try {
    await authorize(req);
    return Response.json({
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
      ready: !!(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
        process.env.VAPID_PRIVATE_KEY &&
        process.env.VAPID_SUBJECT &&
        process.env.CRON_SECRET &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
      ),
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    if (!process.env.VAPID_PRIVATE_KEY)
      throw new ApiError(503, "ההתראות עדיין לא מחוברות.");
    const subscription = Subscription.parse(await jsonBody(req, 6000));
    const { error } = await db.from("push_subscriptions").upsert({
      owner_id: userId,
      endpoint: subscription.endpoint,
      subscription,
    });
    if (error) throw new ApiError(503, "לא הצלחנו לשמור הרשאה להתראות.");
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const b = z
      .object({ endpoint: z.string().max(2000) })
      .parse(await jsonBody(req));
    const { error } = await db
      .from("push_subscriptions")
      .delete()
      .eq("owner_id", userId)
      .eq("endpoint", b.endpoint);
    if (error) throw new ApiError(503, "ביטול ההתראות לא הושלם.");
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
