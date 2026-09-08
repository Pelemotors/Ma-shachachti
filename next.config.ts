import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // Playwright and some hosts hit the dev server as 127.0.0.1 while
  // `next dev --hostname 0.0.0.0` would otherwise block /_next assets.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingIncludes: {
    "/api/chat": ["./lib/agent/instructions.ts"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=(self)",
          },
        ],
      },
    ];
  },
};
export default config;
