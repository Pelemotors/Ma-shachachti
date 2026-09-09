"use client";
import { useRef, useState, useCallback } from "react";
import { Action } from "@/lib/model";
import {
  chatActionsNeedProposal,
  partitionActionsByPolicy,
} from "@/lib/agent/schema";
import { authFetch } from "@/lib/supabase-browser";
import { useHousehold } from "@/lib/use-household";
import { demoReply } from "@/components/demo-reply";
import {
  CHAT_UI_KEY,
  type ProposalController,
} from "./use-proposal-controller";

const CHAT_PENDING_KEY = "ma-shachachti:chat-pending:v1";

type Household = ReturnType<typeof useHousehold>;

export type ChatSendStatus = "idle" | "pending" | "thinking" | "failed";

export type PendingUserMessage = {
  text: string;
  turnId: string;
  createdAt: string;
};

function apiError(data: unknown, fallback: string) {
  const obj =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const err = new Error(
    typeof obj.error === "string" ? obj.error : fallback,
  ) as Error & {
    code?: string;
    requestId?: string;
  };
  if (typeof obj.code === "string") err.code = obj.code;
  if (typeof obj.requestId === "string") err.requestId = obj.requestId;
  return err;
}

export function useChatController(
  h: Household,
  proposalCtrl: ProposalController,
) {
  const { state, mode, busy } = h;
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [sendStatus, setSendStatus] = useState<ChatSendStatus>("idle");
  const [pendingUserMessage, setPendingUserMessage] =
    useState<PendingUserMessage | null>(null);
  const [failedTurnId, setFailedTurnId] = useState<string | null>(null);
  const sendLock = useRef(false);
  const lastFailedMessage = useRef<string | null>(null);

  const {
    proposal,
    persistProposal,
    clearProposal,
    approveProposal,
    rejectProposal,
    removeProposalAction,
    proposalMeta,
  } = proposalCtrl;

  const persistServerProposal = useCallback(
    (data: any) => {
      const proposed = (data?.proposal?.proposedActions ?? []) as Action[];
      if (!proposed.length) return false;
      persistProposal(proposed, {
        proposalId: data.proposalId ?? null,
        summary: data.proposal?.summary,
        similarHints: data.similarHints,
        sourceRevision: data.revision ?? h.currentRevision(),
      });
      return true;
    },
    [h, persistProposal],
  );

  const sendMessage = useCallback(
    async (text = draft) => {
      if (!text.trim() || thinking || busy || proposal || sendLock.current)
        return;
      sendLock.current = true;
      setThinking(true);
      setSendStatus("pending");
      const message = text.trim();
      let idempotencyKey = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      try {
        if (mode === "cloud") {
          try {
            const raw = sessionStorage.getItem(CHAT_PENDING_KEY);
            const pending = raw
              ? (JSON.parse(raw) as {
                  key: string;
                  message: string;
                  contextTaskId: string | null;
                })
              : null;
            if (
              pending?.message === message &&
              pending.contextTaskId === context
            ) {
              idempotencyKey = pending.key;
            } else {
              sessionStorage.setItem(
                CHAT_PENDING_KEY,
                JSON.stringify({
                  key: idempotencyKey,
                  message,
                  contextTaskId: context,
                }),
              );
            }
          } catch {
            sessionStorage.setItem(
              CHAT_PENDING_KEY,
              JSON.stringify({
                key: idempotencyKey,
                message,
                contextTaskId: context,
              }),
            );
          }

          setPendingUserMessage({
            text: message,
            turnId: idempotencyKey,
            createdAt,
          });
          setDraft("");
          setFailedTurnId(null);
          lastFailedMessage.current = null;
          setSendStatus("thinking");

          const response = await authFetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message,
              contextTaskId: context,
              idempotencyKey,
              turnId: idempotencyKey,
              surface: "chat",
            }),
          });
          const data = await response.json();
          if (!response.ok) throw apiError(data, "השיחה התעכבה.");

          if (data.state && typeof data.revision === "number")
            h.adoptRemote(data.state, data.revision);

          setPendingUserMessage(null);
          sessionStorage.removeItem(CHAT_PENDING_KEY);
          sessionStorage.removeItem(CHAT_UI_KEY);
          setSendStatus("idle");

          const proposed =
            data.proposal?.proposedActions ??
            data.explicitActions?.filter?.(
              (a: Action) => a.type === "task.create",
            ) ??
            [];
          const { auto, proposal: needConfirm } = partitionActionsByPolicy([
            ...(data.explicitActions ?? []),
            ...proposed,
          ]);
          void auto;
          if (needConfirm.length || proposed.length) {
            const actions = (
              needConfirm.length ? needConfirm : proposed
            ) as Action[];
            persistProposal(actions, {
              proposalId: data.proposalId ?? null,
              summary: data.proposal?.summary,
              similarHints: data.similarHints,
              sourceRevision: data.revision ?? h.currentRevision(),
            });
          }
        } else {
          setPendingUserMessage({
            text: message,
            turnId: idempotencyKey,
            createdAt,
          });
          setDraft("");
          setSendStatus("thinking");
          const next = await h.commit(
            [
              {
                type: "message.add",
                role: "user",
                text: message,
                turnId: idempotencyKey,
              },
            ],
            false,
            true,
            { turnId: idempotencyKey },
          );
          setPendingUserMessage(null);
          const answer = demoReply(message, next, context);
          const assistantText = answer.reply;
          await h.commit(
            [
              {
                type: "message.add",
                role: "assistant",
                text: assistantText,
                turnId: idempotencyKey,
              },
            ],
            false,
            true,
            { turnId: idempotencyKey },
          );
          const { auto, proposal: needConfirm } = partitionActionsByPolicy(
            answer.actions,
          );
          void auto;
          if (needConfirm.length || chatActionsNeedProposal(answer.actions)) {
            persistProposal(needConfirm.length ? needConfirm : answer.actions, {
              summary:
                needConfirm.filter((a) => a.type === "task.create").length > 1
                  ? `זיהיתי ${needConfirm.filter((a) => a.type === "task.create").length} משימות. להוסיף אותן לרשימת המשימות?`
                  : "זיהיתי משימה אחת. להוסיף אותה לרשימת המשימות?",
              sourceRevision: h.currentRevision(),
            });
          } else if (answer.actions.length) {
            await h.commit(answer.actions, false, true, {
              turnId: idempotencyKey,
            });
          } else {
            await h.commit(
              [
                {
                  type: "operation.record",
                  turnId: idempotencyKey,
                  summary: "chat_turn",
                  actionTypes: [],
                },
              ],
              false,
              true,
              { turnId: idempotencyKey, sealTurn: true },
            );
          }
          setSendStatus("idle");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "השיחה התעכבה.";
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code?: string }).code ?? "")
            : "";
        const requestId =
          e && typeof e === "object" && "requestId" in e
            ? String((e as { requestId?: string }).requestId ?? "")
            : "";
        h.setError(msg);
        setDraft(message);
        lastFailedMessage.current = message;
        setFailedTurnId(idempotencyKey);
        setSendStatus("failed");
        setPendingUserMessage(
          (prev) =>
            prev ?? {
              text: message,
              turnId: idempotencyKey,
              createdAt,
            },
        );
        sessionStorage.setItem(
          CHAT_UI_KEY,
          JSON.stringify({
            error: msg,
            code: code || undefined,
            requestId: requestId || undefined,
            at: Date.now(),
          }),
        );
      } finally {
        sendLock.current = false;
        setThinking(false);
      }
    },
    [draft, thinking, busy, proposal, mode, context, h, persistProposal],
  );

  /**
   * Interpret a fact that the Memory screen has already persisted. This keeps
   * raw user knowledge durable even if AI is unavailable, while giving the same
   * personal agent a chance to apply systemic consequences such as a Routine.
   */
  const processMemory = useCallback(
    async (text: string): Promise<string> => {
      const message = text.trim();
      if (!message || mode !== "cloud") return "";
      if (thinking || busy || proposal || sendLock.current) return "";

      const idempotencyKey = crypto.randomUUID();
      sendLock.current = true;
      setThinking(true);
      try {
        const response = await authFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            contextTaskId: null,
            idempotencyKey,
            turnId: idempotencyKey,
            surface: "memory",
          }),
        });
        const data = await response.json();
        if (!response.ok) throw apiError(data, "העיבוד החכם של הזיכרון התעכב.");

        if (data.state && typeof data.revision === "number")
          h.adoptRemote(data.state, data.revision);
        persistServerProposal(data);
        return typeof data.reply === "string" ? data.reply : "";
      } catch (e) {
        h.setError(
          e instanceof Error ? e.message : "העיבוד החכם של הזיכרון התעכב.",
        );
        throw e;
      } finally {
        sendLock.current = false;
        setThinking(false);
      }
    },
    [mode, thinking, busy, proposal, h, persistServerProposal],
  );

  const retrySend = useCallback(async () => {
    const text = lastFailedMessage.current ?? draft;
    if (!text.trim()) return;
    setSendStatus("pending");
    await sendMessage(text);
  }, [draft, sendMessage]);

  return {
    sendMessage,
    processMemory,
    retrySend,
    approveProposal,
    rejectProposal,
    /** Alias for UX contract */
    approve: approveProposal,
    reject: rejectProposal,
    removeProposalAction,
    isThinking: thinking,
    sendStatus,
    pendingUserMessage,
    failedTurnId,
    draft,
    setDraft,
    proposal,
    proposalMeta,
    context,
    setContext,
    clearProposal,
    persistProposal,
    sendLock,
    setError: h.setError,
    clearError: () => {
      h.setError("");
      sessionStorage.removeItem(CHAT_UI_KEY);
      if (sendStatus === "failed") {
        setSendStatus("idle");
        setFailedTurnId(null);
      }
    },
  };
}

export type ChatController = ReturnType<typeof useChatController>;
