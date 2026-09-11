import type { SupabaseClient } from "@supabase/supabase-js";
import { composeReply, UUID_RE } from "./action-schema.ts";
import { validateStoredPresentation } from "./chat-presentation.ts";
import type {
  ActionResult,
  ClientPresentation,
  ClientProposal,
} from "./types.ts";

export const EMPTY_CHAT_PREVIEW = "שיחה חדשה";
export const SESSION_LIST_PAGE = 20;
const PREVIEW_MAX = 64;

export type ChatSessionSummary = {
  id: string;
  created_at: string;
  last_message_at: string;
  message_count: number;
  preview: string;
};

export type SessionMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  presentation: ClientPresentation | null;
  proposal: ClientProposal | null;
};

export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function chatHistoryUrl(sessionId: string | null | undefined) {
  return sessionId && isSessionId(sessionId)
    ? `/api/chat?session_id=${sessionId}`
    : "/api/chat";
}

export function previewChatSession(firstUserMessage: string | null | undefined) {
  const text = (firstUserMessage ?? "").replace(/\s+/g, " ").trim();
  if (!text) return EMPTY_CHAT_PREVIEW;
  if (text.length <= PREVIEW_MAX) return text;
  const sliced = text.slice(0, PREVIEW_MAX);
  const clipped = sliced.replace(/\s+\S*$/, "").trimEnd();
  return `${clipped || sliced.trimEnd()}...`;
}

export function summarizeChatSessions(
  sessions: Array<{ id: string; created_at: string }>,
  messages: Array<{
    session_id: string;
    role: string;
    content: string;
    created_at: string;
  }>,
  options: { limit?: number; offset?: number } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? SESSION_LIST_PAGE, 1), 40);
  const offset = Math.max(options.offset ?? 0, 0);
  const bySession = new Map<
    string,
    { count: number; last: string; firstUser: string | null }
  >();

  for (const session of sessions) {
    bySession.set(session.id, {
      count: 0,
      last: session.created_at,
      firstUser: null,
    });
  }

  const ordered = [...messages].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  for (const message of ordered) {
    const bucket = bySession.get(message.session_id);
    if (!bucket) continue;
    bucket.count += 1;
    if (message.created_at > bucket.last) bucket.last = message.created_at;
    if (
      !bucket.firstUser &&
      message.role === "user" &&
      message.content.trim()
    ) {
      bucket.firstUser = message.content;
    }
  }

  const listed = sessions
    .map((session) => {
      const bucket = bySession.get(session.id);
      return {
        id: session.id,
        created_at: session.created_at,
        last_message_at: bucket?.last ?? session.created_at,
        message_count: bucket?.count ?? 0,
        preview: previewChatSession(bucket?.firstUser),
      } satisfies ChatSessionSummary;
    })
    .sort((a, b) => {
      const byLast = b.last_message_at.localeCompare(a.last_message_at);
      return byLast !== 0 ? byLast : b.created_at.localeCompare(a.created_at);
    });

  return {
    sessions: listed.slice(offset, offset + limit),
    total: listed.length,
    has_more: offset + limit < listed.length,
  };
}

export async function resolveReadableChatSession(
  db: SupabaseClient,
  userId: string,
  requested: string | null | undefined,
) {
  if (requested == null || requested === "") {
    const session = await latestOrCreateChatSession(db, userId);
    if (!session) return { ok: false as const, status: 503 as const };
    return { ok: true as const, session };
  }
  if (!isSessionId(requested)) {
    return { ok: false as const, status: 400 as const };
  }
  if (!(await ownChatSession(db, userId, requested))) {
    return { ok: false as const, status: 403 as const };
  }
  return { ok: true as const, session: { id: requested } };
}

export async function createChatSession(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("chat_sessions")
    .insert({ user_id: userId })
    .select("id,created_at")
    .single();
  if (error || !data) return null;
  return data as { id: string; created_at: string };
}

export async function latestChatSession(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("chat_sessions")
    .select("id,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as { id: string; created_at: string } | null) ?? null;
}

export async function latestOrCreateChatSession(
  db: SupabaseClient,
  userId: string,
) {
  return (await latestChatSession(db, userId)) ?? createChatSession(db, userId);
}

export async function ownChatSession(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
) {
  const { data, error } = await db
    .from("chat_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function listChatSessions(
  db: SupabaseClient,
  userId: string,
  options: { limit?: number; offset?: number } = {},
) {
  const { data: sessions, error } = await db
    .from("chat_sessions")
    .select("id,created_at")
    .eq("user_id", userId);
  if (error) throw error;
  const rows = (sessions ?? []) as Array<{ id: string; created_at: string }>;
  if (!rows.length) {
    return { sessions: [] as ChatSessionSummary[], total: 0, has_more: false };
  }
  const { data: messages, error: messageError } = await db
    .from("chat_messages")
    .select("session_id,role,content,created_at")
    .eq("user_id", userId)
    .in(
      "session_id",
      rows.map((session) => session.id),
    )
    .order("created_at", { ascending: true });
  if (messageError) throw messageError;
  return summarizeChatSessions(
    rows,
    (messages ?? []) as Array<{
      session_id: string;
      role: string;
      content: string;
      created_at: string;
    }>,
    options,
  );
}

export async function loadSessionMessages(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
) {
  const { data, error } = await db
    .from("chat_messages")
    .select("id,role,content,created_at,presentation,turn_id")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (
    (data ?? []) as Array<Omit<SessionMessage, "presentation" | "proposal"> & {
      presentation?: unknown;
      turn_id?: string | null;
    }>
  );
  const turnIds = [
    ...new Set(
      rows
        .map((message) => message.turn_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const proposals = new Map<string, ClientProposal>();
  if (turnIds.length > 0) {
    const { data: proposalRows, error: proposalError } = await db
      .from("agent_proposals")
      .select("id,turn_id,summary,status,revision,expires_at,action_results")
      .eq("user_id", userId)
      .in("turn_id", turnIds);
    if (proposalError) throw proposalError;
    for (const proposal of proposalRows ?? []) {
      proposals.set(String(proposal.turn_id), {
        id: String(proposal.id),
        summary: String(proposal.summary),
        status: proposal.status as ClientProposal["status"],
        revision: Number(proposal.revision),
        expires_at: String(proposal.expires_at),
        result_reply: Array.isArray(proposal.action_results)
          ? composeReply("", proposal.action_results as ActionResult[])
          : null,
      });
    }
  }
  return rows
    .map((message) => ({
      ...message,
      presentation: validateStoredPresentation(message.presentation),
      proposal: message.turn_id ? (proposals.get(message.turn_id) ?? null) : null,
    }))
    .reverse();
}

export async function persistTurnMessage(
  db: SupabaseClient,
  input: {
    userId: string;
    sessionId: string;
    turnId: string;
    role: "user" | "assistant";
    content: string;
    presentation?: ClientPresentation | null;
  },
) {
  const row = {
    user_id: input.userId,
    session_id: input.sessionId,
    turn_id: input.turnId,
    role: input.role,
    content: input.content,
    presentation: input.presentation ?? null,
  };
  const { data, error } = await db
    .from("chat_messages")
    .insert(row)
    .select("id,content,created_at,presentation")
    .single();
  if (!error && data) return data;
  if (error?.code !== "23505") throw error;

  const { data: existing, error: existingError } = await db
    .from("chat_messages")
    .select("id,content,created_at,presentation")
    .eq("user_id", input.userId)
    .eq("turn_id", input.turnId)
    .eq("role", input.role)
    .maybeSingle();
  if (existingError || !existing) throw existingError ?? error;
  if (
    existing.content !== input.content ||
    JSON.stringify(existing.presentation ?? null) !==
      JSON.stringify(input.presentation ?? null)
  ) {
    throw new Error("turn_message_conflict");
  }
  return existing;
}
