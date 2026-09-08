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

export function useChatController(
  h: Household,
  proposalCtrl: ProposalController,
) {
  const { state, mode, busy } = h;
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const sendLock = useRef(false);

  const {
    proposal,
    persistProposal,
    clearProposal,
    approveProposal,
    rejectProposal,
    removeProposalAction,
    proposalMeta,
  } = proposalCtrl;

  const sendMessage = useCallback(
    async (text = draft) => {
      if (!text.trim() || thinking || busy || proposal || sendLock.current)
        return;
      sendLock.current = true;
      setThinking(true);
      const message = text.trim();
      try {
        let idempotencyKey = crypto.randomUUID();
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

          setDraft("");
          const response = await authFetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message,
              contextTaskId: context,
              idempotencyKey,
              turnId: idempotencyKey,
            }),
          });
          const data = await response.json();
          if (!response.ok) {
            const err = new Error(
              typeof data.error === "string" ? data.error : "השיחה התעכבה.",
            ) as Error & { code?: string; requestId?: string };
            if (typeof data.code === "string") err.code = data.code;
            if (typeof data.requestId === "string")
              err.requestId = data.requestId;
            throw err;
          }

          if (data.state && typeof data.revision === "number") {
            h.adoptRemote(data.state, data.revision);
          }

          // Terminal only after successful response (including receipt on server).
          sessionStorage.removeItem(CHAT_PENDING_KEY);
          sessionStorage.removeItem(CHAT_UI_KEY);

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
          // Safety: never auto-apply task.create even if server mis-buckets.
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
          // Local demo: keep client turn, but never auto-apply task.create.
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
          setDraft("");
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
          if (needConfirm.length || chatActionsNeedProposal(answer.actions)) {
            persistProposal(needConfirm.length ? needConfirm : answer.actions, {
              summary:
                needConfirm.filter((a) => a.type === "task.create").length > 1
                  ? `זיהיתי ${needConfirm.filter((a) => a.type === "task.create").length} משימות. להוסיף אותן לרשימת המשימות?`
                  : "זיהיתי משימה אחת. להוסיף אותה לרשימת המשימות?",
              sourceRevision: h.currentRevision(),
            });
            await h.commit(
              [
                {
                  type: "operation.record",
                  turnId: idempotencyKey,
                  summary: "proposal_pending",
                  actionTypes: needConfirm.map((a) => a.type),
                },
              ],
              false,
              true,
              { turnId: idempotencyKey, sealTurn: true },
            );
          } else if (auto.length) {
            await h.commit(auto, false, true, {
              turnId: idempotencyKey,
              sealTurn: true,
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
        sessionStorage.setItem(
          CHAT_UI_KEY,
          JSON.stringify({
            error: msg,
            code: code || undefined,
            requestId: requestId || undefined,
            at: Date.now(),
          }),
        );
        // Keep CHAT_PENDING_KEY for cloud retry of the same turn.
      } finally {
        sendLock.current = false;
        setThinking(false);
      }
    },
    [draft, thinking, busy, proposal, state, mode, context, h, persistProposal],
  );

  return {
    sendMessage,
    approveProposal,
    rejectProposal,
    removeProposalAction,
    isThinking: thinking,
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
    },
  };
}

export type ChatController = ReturnType<typeof useChatController>;
