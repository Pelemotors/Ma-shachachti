import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const env = Object.fromEntries(
  readFileSync("/srv/ira/ma-shachachti/app/.env.qa", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const ANON =
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const login = await fetch(
  "http://127.0.0.1:8011/auth/v1/token?grant_type=password",
  {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "qa-tester@example.com",
      password: "QaTestPass123!",
    }),
  },
);
const { access_token: token, user } = await login.json();
execSync(
  `docker exec mashachachti-qa-db-1 psql -U postgres -c "DELETE FROM agent_memory WHERE user_id='${user.id}'"`,
);
const chat = await fetch("http://127.0.0.1:3011/api/chat", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    message:
      "כשאני אומרת כביסה יש גם קיפול ופיזור. שמרי כ־action_followup JSON.",
    turn_id: crypto.randomUUID(),
  }),
});
console.log("status", chat.status, "reply", (await chat.json()).reply);
const mem = await fetch(
  `http://127.0.0.1:8011/rest/v1/agent_memory?select=content&user_id=eq.${user.id}`,
  { headers: { apikey: ANON, Authorization: `Bearer ${token}` } },
);
console.log("memory", await mem.json());
