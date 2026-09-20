import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dest = resolve(import.meta.dirname, "..", ".env");
const html = await (await fetch("https://mashachachti.co.il")).text();
const scripts = [...html.matchAll(/\/_next\/static\/[^"' ]+\.js/g)].map((m) => m[0]);
const unique = [...new Set(scripts)];

let key = "";
let source = "";

for (const path of unique) {
  const js = await (await fetch(`https://mashachachti.co.il${path}`)).text();
  const pub = js.match(
    /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY["']?\s*[:=,]\s*["']([^"']+)["']/,
  );
  const anon = js.match(
    /NEXT_PUBLIC_SUPABASE_ANON_KEY["']?\s*[:=,]\s*["']([^"']+)["']/,
  );
  const envish = js.match(
    /supabase[^\n]{0,80}(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i,
  );
  if (pub?.[1]) {
    key = pub[1];
    source = "publishable_in_bundle";
    break;
  }
  if (anon?.[1]) {
    key = anon[1];
    source = "anon_in_bundle";
    break;
  }
  if (envish?.[1]) {
    key = envish[1];
    source = "jwt_near_supabase";
    break;
  }
}

if (!key) {
  console.log("EXTRACT: FAIL");
  process.exit(2);
}
if (/service_role|sk_live|OPENAI|postgres/i.test(key)) {
  console.log("EXTRACT: REJECTED");
  process.exit(3);
}

const kind = key.startsWith("eyJ")
  ? "jwt_anon"
  : key.startsWith("sb_publishable_")
    ? "publishable"
    : "unknown";
if (kind === "unknown") {
  console.log("EXTRACT: UNKNOWN_KIND");
  process.exit(4);
}

writeFileSync(
  dest,
  [
    "# Mobile app — local Dev Client. Do not commit.",
    "MOBILE_API_BASE_URL=https://mashachachti.co.il",
    "EXPO_PUBLIC_SUPABASE_URL=https://supabase.mashachachti.co.il",
    `EXPO_PUBLIC_SUPABASE_ANON_KEY=${key}`,
    "",
  ].join("\n"),
  "utf8",
);

const check = readFileSync(dest, "utf8");
console.log(`EXTRACT_SOURCE=${source}`);
console.log(`KEY_KIND=${kind}`);
console.log(`KEY_LEN=${key.length}`);
console.log(
  `HAS_API_URL=${check.includes("MOBILE_API_BASE_URL=https://mashachachti.co.il")}`,
);
console.log(
  `HAS_SB_URL=${check.includes("EXPO_PUBLIC_SUPABASE_URL=https://supabase.mashachachti.co.il")}`,
);
console.log(
  `HAS_KEY=${/EXPO_PUBLIC_SUPABASE_ANON_KEY=\S+/.test(check)}`,
);
console.log(
  `NO_SERVER_SECRETS=${!/SERVICE_ROLE|OPENAI|POSTGRES|sk-/.test(check)}`,
);
