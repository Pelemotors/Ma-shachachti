import { googleSignInWebClientId } from "@/lib/auth/verify-jwt";

export const runtime = "nodejs";

/** Public mobile config only. Never returns secrets or tokens. */
export async function GET() {
  const webClientId = googleSignInWebClientId();
  return Response.json({
    google: {
      enabled: Boolean(webClientId),
      webClientId: webClientId || null,
    },
  });
}
