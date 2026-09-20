import { authorize, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase-admin";
import {
  calendarOAuthConfigured,
  createCalendarOAuthState,
  googleAuthorizationUrl,
} from "@/lib/calendar";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { userId } = await authorize(req);
    if (!calendarOAuthConfigured()) {
      throw new HttpError(503, "חיבור היומן אינו מוגדר בסביבה זו.");
    }
    const admin = createServiceClient();
    const state = await createCalendarOAuthState(admin, userId);
    return Response.json({
      authorizationUrl: googleAuthorizationUrl(state),
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "פתיחת חיבור היומן נכשלה." }, { status: 500 });
  }
}
