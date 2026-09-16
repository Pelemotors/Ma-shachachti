import type { NextConfig } from "next";

function assertBuildEnvSafe() {
  const appEnv = (process.env.APP_ENV || "").trim().toLowerCase();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const distDir = process.env.NEXT_DIST_DIR || ".next";
  const productionBuild = process.env.MA_SHACHACHTI_PRODUCTION_BUILD === "1";
  const qaBuild = appEnv === "qa" || distDir === ".next-qa";

  if (productionBuild && qaBuild) {
    throw new Error(
      "Production build guard: APP_ENV=qa / NEXT_DIST_DIR=.next-qa אסורים ב-build:prod",
    );
  }
  if (productionBuild) {
    if (appEnv === "qa") {
      throw new Error("Production build guard: APP_ENV=qa אסור");
    }
    if (/8011|mashachachti-qa/i.test(url)) {
      throw new Error(
        `Production build guard: QA Supabase URL אסור (${url || "empty"})`,
      );
    }
    if (!/^https:\/\/supabase\.mashachachti\.co\.il\/?$/i.test(url)) {
      throw new Error(
        `Production build guard: חסר/שגוי NEXT_PUBLIC_SUPABASE_URL (${url || "empty"})`,
      );
    }
  }
  if (qaBuild && !/8011/.test(url)) {
    throw new Error(
      `QA build guard: NEXT_PUBLIC_SUPABASE_URL חייב לכלול :8011 (קיבל: ${url || "empty"})`,
    );
  }
}

assertBuildEnvSafe();

const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  // Allow isolated QA builds without overwriting production `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingIncludes: {
    "/api/chat": ["./lib/agent/instructions.ts"],
  },
  serverExternalPackages: ["web-push"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          ...(process.env.APP_ENV === "qa"
            ? [{ key: "X-App-Env", value: "qa" }]
            : []),
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default config;
