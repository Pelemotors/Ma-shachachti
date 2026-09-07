/**
 * Mechanical extraction helpers for home-app infrastructure cleanup.
 * Creates shared components + shell wiring; views/controllers written by companion scripts.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const abs = (...p) => path.join(root, ...p);
const write = (rel, content) => {
  const file = abs(rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.replace(/\r\n/g, "\n"));
  console.log("W", rel, content.split(/\n/).length);
};

const home = fs.readFileSync(abs("components/home-app.tsx"), "utf8");

// Extract describe function
const describeMatch = home.match(
  /function describe\(a: Action\): string \{[\s\S]*?\n\}/,
);
if (!describeMatch) throw new Error("describe not found");
write(
  "components/action-describe.ts",
  `import type { Action } from "@/lib/model";\n\nexport ${describeMatch[0]}\n`,
);

const demoMatch = home.match(/function demoReply\([\s\S]*?\n\}/);
if (!demoMatch) throw new Error("demoReply not found");
write(
  "components/demo-reply.ts",
  `import type { Action, AppState } from "@/lib/model";\n\nexport ${demoMatch[0]}\n`,
);

// TaskCard
const taskCardMatch = home.match(
  /function TaskCard\([\s\S]*?\n\}\nfunction Empty/,
);
if (!taskCardMatch) throw new Error("TaskCard not found");
const taskCardBody = taskCardMatch[0].replace(/\nfunction Empty$/, "");
write(
  "components/task-card.tsx",
  `"use client";
import { Check, Clock3, MessageCircle } from "lucide-react";
import type { Action, AppState, Task } from "@/lib/model";
import { categoryLabel } from "@/lib/taxonomy";
import { estimatedMinutes, shouldAskWorkTime, blocked } from "@/lib/engine";
import { formatTime } from "@/lib/time";

export ${taskCardBody}
`,
);

write(
  "components/empty-state.tsx",
  `"use client";
import { Leaf } from "lucide-react";

export function Empty({
  text,
  action,
  label,
}: {
  text: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <Leaf size={28} />
      <p>{text}</p>
      {action && (
        <button className="secondary" onClick={action}>
          {label}
        </button>
      )}
    </div>
  );
}
`,
);

write(
  "components/view-header.tsx",
  `"use client";
import type { AppView } from "@/hooks/app-view";

export function ViewHeader({
  children,
  title,
}: {
  children?: React.ReactNode;
  title: string;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export const VIEW_TITLES: Record<AppView, string> = {
  home: "הבית שלך",
  chat: "אני כאן איתך",
  tasks: "המשימות שלי",
  shopping: "רשימת קניות",
  memory: "מה אני זוכר",
  settings: "הבית וההעדפות",
  reminders: "תזכורות",
  kit: "מתאים לבית שלכם?",
  history: "מה כבר נעשה",
  focus: "מה שכחתי?",
  plan: "נעשה סדר ביום",
  free: "זמן בשביל מה שמתאים",
};
`,
);

write(
  "hooks/app-view.ts",
  `export type AppView =
  | "home"
  | "chat"
  | "tasks"
  | "shopping"
  | "memory"
  | "settings"
  | "reminders"
  | "kit"
  | "history"
  | "focus"
  | "plan"
  | "free";
`,
);

write(
  "hooks/async-state.ts",
  `export type AsyncState = "idle" | "loading" | "success" | "error";
`,
);

console.log("shared extracts done");
