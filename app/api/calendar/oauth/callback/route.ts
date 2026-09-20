import { createServiceClient } from "@/lib/supabase-admin";
import {
  calendarAppRedirect,
  calendarOAuthConfigured,
  claimCalendarOAuthState,
  exchangeGoogleCalendarCode,
  storeCalendarTokens,
  syncGoogleCalendar,
} from "@/lib/calendar";

export const runtime = "nodejs";

function redirect(status: "success" | "cancelled" | "error") {
  return new Response(null, {
    status: 302,
    headers: { Location: calendarAppRedirect(status) },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (error === "access_denied") return redirect("cancelled");
  if (!code || !state || !calendarOAuthConfigured()) return redirect("error");

  try {
    const admin = createServiceClient();
    const claimed = await claimCalendarOAuthState(admin, state);
    if (!claimed.ok) {
      console.error("calendar_oauth_state", claimed.reason);
      return redirect("error");
    }
    const tokens = await exchangeGoogleCalendarCode(code);
    await storeCalendarTokens(admin, claimed.userId, tokens);
    try {
      await syncGoogleCalendar(admin, claimed.userId);
    } catch (syncError) {
      const codeName = syncError instanceof Error ? syncError.name : "sync_failed";
      console.error("calendar_oauth_initial_sync", codeName);
    }
    return redirect("success");
  } catch (caught) {
    const codeName = caught instanceof Error ? caught.name : "callback_failed";
    console.error("calendar_oauth_callback", codeName);
    return redirect("error");
  }
}
