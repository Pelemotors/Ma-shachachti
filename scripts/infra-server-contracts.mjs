import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const w = (rel, content) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.replace(/\r\n/g, "\n"));
  console.log("W", rel);
};

const serverSrc = fs.readFileSync(path.join(root, "lib/server.ts"), "utf8");
if (serverSrc.includes("export class ApiError")) {
  // Split once while full implementation still lives in lib/server.ts
  w(
    "lib/server/errors.ts",
    `import { messageForCode } from "../errors";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "request_failed",
  ) {
    super(message);
  }
}

export function fail(e: unknown, requestId?: string) {
  if (e instanceof ApiError)
    return Response.json(
      { error: e.message, code: e.code, requestId },
      { status: e.status },
    );
  if (e instanceof Error && e.name === "ZodError")
    return Response.json(
      {
        error: messageForCode("invalid_input"),
        code: "invalid_input",
        requestId,
      },
      { status: 400 },
    );
  console.error("Request failed", {
    requestId,
    error: e instanceof Error ? e.name : "unknown",
  });
  return Response.json(
    {
      error: messageForCode("internal_error"),
      code: "internal_error",
      requestId,
    },
    { status: 500 },
  );
}
`,
  );

  w(
    "lib/server/auth.ts",
    `import { createClient } from "@supabase/supabase-js";
import { ApiError } from "./errors";

export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new ApiError(
      503,
      "שירות הרקע עדיין לא הוגדר.",
      "backend_not_configured",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authorize(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new ApiError(
      503,
      "שמירה בענן עדיין לא מחוברת.",
      "cloud_not_configured",
    );
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token)
    throw new ApiError(401, "צריך להתחבר כדי להמשיך.", "auth_required");
  const db = createClient(url, key, {
    global: { headers: { Authorization: \`Bearer \${token}\` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new ApiError(
      401,
      "ההתחברות הסתיימה. יש להתחבר שוב.",
      "session_expired",
    );
  const { data: role, error: roleError } = await db
    .from("user_roles")
    .select("approved")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (roleError || !role?.approved)
    throw new ApiError(
      403,
      "החשבון ממתין לאישור מנהל.",
      "account_not_approved",
    );
  return { db, userId: data.user.id };
}
`,
  );

  w(
    "lib/server/activity.ts",
    `import { adminDb } from "./auth";

export async function activity(
  ownerId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    const { error } = await adminDb()
      .from("activity_events")
      .insert({ owner_id: ownerId, event_type: eventType, metadata });
    if (error) console.error("Activity event write failed", { eventType });
  } catch {
    console.error("Activity event write failed", { eventType });
  }
}
`,
  );

  w(
    "lib/server/budgets.ts",
    `import { adminDb } from "./auth";
import { ApiError } from "./errors";

export async function budget(userId: string, kind: string, limit: number) {
  const db = adminDb();
  const { data, error } = await db.rpc("consume_ai_budget", {
    p_owner: userId,
    p_kind: kind,
    p_limit: limit,
  });
  if (error)
    throw new ApiError(503, "בקרת השימוש אינה זמינה.", "budget_unavailable");
  if (!data)
    throw new ApiError(
      429,
      "הגענו למכסת הבקשות לשעה. אפשר להמשיך לנהל משימות ולנסות שוב בהמשך.",
      "hourly_limit",
    );
}
`,
  );

  w(
    "lib/server/state-store.ts",
    `import type { SupabaseClient } from "@supabase/supabase-js";
import { AppState, emptyState, migrateState, StateV2Schema } from "../model";
import { ApiError } from "./errors";

export async function readState(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("app_states")
    .select("data,revision")
    .eq("owner_id", userId)
    .maybeSingle();
  if (error)
    throw new ApiError(
      503,
      "לא ניתן לקרוא את המידע בענן.",
      "state_read_failed",
    );
  // Dual-read: V1 is migrated in-memory to V2; never throw Zod V2 errors at existing users.
  const state = data ? migrateState(data.data) : emptyState();
  const { data: queue, error: queueError } = await db
    .from("reminder_queue")
    .select("id,status")
    .eq("owner_id", userId);
  if (queueError)
    throw new ApiError(
      503,
      "לא ניתן לקרוא את מצב התזכורות.",
      "reminder_read_failed",
    );
  for (const reminder of state.reminders) {
    const q = queue?.find((x) => x.id === reminder.id);
    if (q) reminder.status = q.status;
  }
  return { state, revision: data?.revision ?? 0 };
}

export async function saveState(
  db: SupabaseClient,
  state: AppState,
  revision: number,
) {
  const parsed = StateV2Schema.parse(migrateState(state));
  const { data, error } = await db.rpc("save_app_state", {
    p_data: parsed,
    p_expected_revision: revision,
  });
  if (error) {
    if (error.message.includes("revision_conflict"))
      throw new ApiError(
        409,
        "המידע השתנה בחלון אחר. טענו מחדש לפני ניסיון נוסף.",
        "revision_conflict",
      );
    throw new ApiError(
      503,
      "השמירה לא הצליחה. השינוי עדיין לא נשמר.",
      "state_save_failed",
    );
  }
  return Number(data);
}

export async function jsonBody(req: Request, max = 1_000_000) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > max)
    throw new ApiError(413, "הבקשה גדולה מדי.", "payload_too_large");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "חסר תוכן.", "missing_body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new ApiError(413, "הבקשה גדולה מדי.", "payload_too_large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(all));
  } catch {
    throw new ApiError(400, "הבקשה אינה תקינה.", "invalid_json");
  }
}
`,
  );

  w(
    "lib/server/idempotency.ts",
    `/** Chat idempotency keys are enforced in API routes / DB receipts. */
export {};
`,
  );

  w(
    "lib/server/proposals.ts",
    `/** pending_proposals table helpers — see app/api/proposals/route.ts */
export {};
`,
  );

  w(
    "lib/server/index.ts",
    `export { ApiError, fail } from "./errors";
export { adminDb, authorize } from "./auth";
export { activity } from "./activity";
export { budget } from "./budgets";
export { readState, saveState, jsonBody } from "./state-store";
`,
  );

  w(
    "lib/server.ts",
    `/** Barrel — prefer \`@/lib/server\` imports. */
export * from "./server/index";
`,
  );
}

// Persistence
w(
  "lib/persistence/types.ts",
  `import type { Action, AppState } from "../model";

export type StateSnapshot = {
  state: AppState;
  revision: number;
};

export type CommitOptions = {
  confirmed?: boolean;
  skipNotice?: boolean;
  turnId?: string;
  sealTurn?: boolean;
};

export interface StateRepository {
  read(): Promise<StateSnapshot>;
  commit(
    actions: Action[],
    options?: CommitOptions,
  ): Promise<StateSnapshot>;
}
`,
);

w(
  "lib/persistence/cloud-state-repository.ts",
  `import type { Action } from "../model";
import { authFetch } from "../supabase-browser";
import type { CommitOptions, StateRepository, StateSnapshot } from "./types";

export class CloudStateRepository implements StateRepository {
  async read(): Promise<StateSnapshot> {
    const res = await authFetch("/api/state", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return { state: data.state, revision: data.revision };
  }

  async commit(
    actions: Action[],
    options: CommitOptions = {},
  ): Promise<StateSnapshot> {
    const res = await authFetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actions,
        confirmed: options.confirmed ?? false,
        turnId: options.turnId,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return { state: data.state, revision: data.revision };
  }
}
`,
);

w(
  "lib/persistence/local-state-repository.ts",
  `import {
  Action,
  AppState,
  emptyState,
  migrateState,
} from "../model";
import { applyActions } from "../engine";
import type { CommitOptions, StateRepository, StateSnapshot } from "./types";

const LOCAL_KEY = "ma-shachachti:local:v1";

export class LocalStateRepository implements StateRepository {
  private revision = 0;

  async read(): Promise<StateSnapshot> {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const state = raw ? migrateState(JSON.parse(raw)) : emptyState();
      return { state, revision: this.revision };
    } catch {
      return { state: emptyState(), revision: 0 };
    }
  }

  async commit(
    actions: Action[],
    options: CommitOptions = {},
  ): Promise<StateSnapshot> {
    const current = await this.read();
    const next = applyActions(
      current.state,
      actions,
      new Date(),
      options.confirmed ?? false,
    );
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    this.revision += 1;
    return { state: next, revision: this.revision };
  }

  static save(state: AppState) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  }
}
`,
);

w(
  "lib/persistence/index.ts",
  `export type { StateRepository, StateSnapshot, CommitOptions } from "./types";
export { CloudStateRepository } from "./cloud-state-repository";
export { LocalStateRepository } from "./local-state-repository";
`,
);

// Contracts
w(
  "lib/contracts/chat.ts",
  `import { z } from "zod";
import { ActionSchema } from "../model";

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(6000),
  contextTaskId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().uuid().optional(),
  turnId: z.string().uuid().optional(),
});

export const ChatResponseSchema = z.object({
  reply: z.string(),
  actions: z.array(ActionSchema).default([]),
  explicitActions: z.array(ActionSchema).optional(),
  clarification: z
    .object({
      question: z.string(),
      unresolvedPart: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  proposal: z
    .object({
      summary: z.string(),
      proposedActions: z.array(ActionSchema),
    })
    .nullable()
    .optional(),
  basedOnRevision: z.number().int().optional(),
  turnId: z.string().uuid().optional(),
});
`,
);

w(
  "lib/contracts/actions.ts",
  `import { z } from "zod";
import { ActionBatch } from "../model";

export const ActionsRequestSchema = z.object({
  actions: ActionBatch,
  confirmed: z.boolean().optional(),
  turnId: z.string().uuid().optional(),
  expectedRevision: z.number().int().optional(),
});
`,
);

w(
  "lib/contracts/proposals.ts",
  `import { z } from "zod";
import { ActionSchema } from "../model";

export const ProposalRecordSchema = z.object({
  id: z.string().uuid(),
  summary: z.string(),
  proposedActions: z.array(ActionSchema),
  status: z.enum(["pending", "approved", "rejected", "expired"]),
  sourceRevision: z.number().int(),
  turnId: z.string().uuid().nullable().optional(),
});
`,
);

w(
  "lib/contracts/state.ts",
  `import { z } from "zod";

export const StatePutRequestSchema = z.object({
  state: z.unknown(),
  revision: z.number().int().min(0),
});
`,
);

w(
  "lib/contracts/push.ts",
  `import { z } from "zod";

export const PushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z
    .object({
      p256dh: z.string().optional(),
      auth: z.string().optional(),
    })
    .passthrough(),
});
`,
);

w(
  "lib/contracts/index.ts",
  `export * from "./chat";
export * from "./actions";
export * from "./proposals";
export * from "./state";
export * from "./push";
`,
);

// Time: keep lib/time.ts as file (no lib/time/ dir — path collision).
// relative-time stays at lib/relative-time.ts and is re-exported from time.ts by a patch below.

// Agent orchestration stubs / extractions
w(
  "lib/agent/policy.ts",
  `export {
  classifyActionPolicy,
  partitionActionsByPolicy,
  type ActionPolicyBucket,
} from "./schema";
`,
);

w(
  "lib/agent/decision.ts",
  `export {
  AgentDecisionSchema,
  AgentProposalSchema,
  ClarificationSchema,
  parseAgentDecisionText,
  parseAgentDecisionIsolated,
  type AgentDecision,
  type AgentProposal,
} from "./schema";
`,
);

w(
  "lib/agent/action-validation.ts",
  `import { applyActions } from "../engine";
import type { Action, AppState } from "../model";

export function filterRunnableActions(
  state: AppState,
  actions: Action[],
  now: Date,
) {
  const accepted: Action[] = [];
  const rejected: Action[] = [];
  for (const action of actions) {
    try {
      applyActions(state, [action], now, true);
      accepted.push(action);
    } catch {
      rejected.push(action);
    }
  }
  return { accepted, rejected };
}
`,
);

w(
  "lib/agent/client.ts",
  `/** OpenAI Responses client helpers used by orchestration. */
export type OpenAIResponse = {
  status?: string;
  output?: { content?: { type: string; text?: string }[] }[];
};

export function outputText(data: OpenAIResponse) {
  return (data.output ?? [])
    .flatMap((x) => x.content ?? [])
    .filter((x) => x.type === "output_text")
    .map((x) => x.text ?? "")
    .join("")
    .trim();
}
`,
);

console.log("server/persistence/contracts/agent scaffolded");
