import { z } from "zod";
import { authorize, HttpError } from "@/lib/server-auth";
import { isTelemetryEvent } from "@/lib/auth/identity";
import { logMobileEvent, sanitizeTelemetryMetadata } from "@/lib/observability";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await authorize(req);
    const body = z
      .object({
        event: z.string().max(80),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(await req.json());
    if (!isTelemetryEvent(body.event)) {
      throw new HttpError(400, "אירוע לא מורשה.");
    }
    logMobileEvent(body.event, {
      ...sanitizeTelemetryMetadata(body.metadata),
      user: userId.slice(0, 8),
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "telemetry rejected" }, { status: 400 });
  }
}
