import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
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
