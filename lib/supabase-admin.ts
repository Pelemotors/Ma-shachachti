import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { HttpError } from "./server-auth.ts";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new HttpError(503, "שליחת התראות עדיין לא הוגדרה.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function authorizeCron(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new HttpError(503, "שליחת התראות עדיין לא הוגדרה.");
  const actual = req.headers.get("authorization") ?? "";
  const wanted = `Bearer ${secret}`;
  if (
    !actual ||
    Buffer.byteLength(actual) !== Buffer.byteLength(wanted) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(wanted))
  ) {
    throw new HttpError(401, "אין הרשאה להפעיל תזכורות.");
  }
}
