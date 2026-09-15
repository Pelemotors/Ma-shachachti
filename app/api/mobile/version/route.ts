import { z } from "zod";
import { authorize, HttpError } from "@/lib/server-auth";
import {
  DEFAULT_FEATURE_FLAGS,
  envFlag,
  type FeatureFlagName,
} from "@/lib/auth/identity";
import { mobileVersionPolicy } from "@/lib/mobile-version";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { db } = await authorize(req);
    const { data } = await db.from("app_feature_flags").select("key,enabled");
    const overrides: Partial<Record<FeatureFlagName, boolean>> = {};
    for (const row of data ?? []) {
      const key = row.key as FeatureFlagName;
      if (key in DEFAULT_FEATURE_FLAGS) overrides[key] = Boolean(row.enabled);
    }
    const flags = {
      ...DEFAULT_FEATURE_FLAGS,
    } as Record<FeatureFlagName, boolean>;
    (Object.keys(DEFAULT_FEATURE_FLAGS) as FeatureFlagName[]).forEach((key) => {
      flags[key] = envFlag(key, overrides[key] ?? DEFAULT_FEATURE_FLAGS[key]);
    });
    const url = new URL(req.url);
    return Response.json({
      flags,
      version: mobileVersionPolicy({
        platform: url.searchParams.get("platform") || "web",
        version: url.searchParams.get("version") || "0.2.0-lean",
        build: url.searchParams.get("build") || "web",
      }),
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "לא הצלחנו לטעון הגדרות מובייל." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await authorize(req);
    const body = z
      .object({
        platform: z.string().max(20),
        version: z.string().max(40),
        build: z.string().max(40),
      })
      .parse(await req.json());
    return Response.json({ policy: mobileVersionPolicy(body) });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "בקשת גרסה אינה תקינה." }, { status: 400 });
  }
}
