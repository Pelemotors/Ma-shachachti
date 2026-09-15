import { z } from "zod";
import { authorize, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase-admin";
import { upsertIdentityAndSession, verifyNativeProvider } from "@/lib/auth/native-session";
import { appleAudiencesFromEnv, googleAudiencesFromEnv } from "@/lib/auth/verify-jwt";
import { logMobileEvent } from "@/lib/observability";

export const runtime = "nodejs";

const Body = z.object({
  provider: z.enum(["apple", "google"]),
  identityToken: z.string().min(20).max(8000),
  nonce: z.string().max(200).optional().nullable(),
  fullName: z.string().max(200).optional().nullable(),
});

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return Response.json({ error: "בקשת ההתחברות אינה תקינה." }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "";
  if (message === "missing_apple_audience" || message === "missing_google_audience") {
    return Response.json(
      { error: "חסרים מזהי ספק. נדרשת הגדרת owner.", code: "OWNER_BLOCKED" },
      { status: 503 },
    );
  }
  console.error("Native auth error", message);
  return Response.json({ error: "ההתחברות נכשלה." }, { status: 401 });
}

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    if (body.provider === "apple" && !appleAudiencesFromEnv().length) {
      throw new Error("missing_apple_audience");
    }
    if (body.provider === "google" && !googleAudiencesFromEnv().length) {
      throw new Error("missing_google_audience");
    }
    logMobileEvent("LOGIN_STARTED", { provider: body.provider });
    let authenticatedUserId: string | null = null;
    try {
      authenticatedUserId = (await authorize(req)).userId;
    } catch {
      authenticatedUserId = null;
    }
    const verified = await verifyNativeProvider({
      provider: body.provider,
      identityToken: body.identityToken,
      nonce: body.nonce,
    });
    const admin = createServiceClient();
    const result = await upsertIdentityAndSession({
      admin,
      verified,
      authenticatedUserId,
      fullName: body.fullName,
    });
    if (!result.ok) {
      logMobileEvent("LOGIN_FAILED", { provider: body.provider });
      return Response.json({ error: result.error }, { status: result.status });
    }
    logMobileEvent("LOGIN_SUCCEEDED", { provider: body.provider });
    return Response.json({
      ok: true,
      userId: result.userId,
      action: result.action,
      hashedToken: result.hashedToken,
    });
  } catch (error) {
    logMobileEvent("LOGIN_FAILED", {});
    return jsonError(error);
  }
}
