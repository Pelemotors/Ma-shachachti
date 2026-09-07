"use client";
import { useRef, useState, useCallback } from "react";
import { Action } from "@/lib/model";
import { requiresConfirmation } from "@/lib/engine";
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
    proposalRevision,
    persistProposal,
    clearProposal,
    setProposal,
    approveProposal,
    rejectProposal,
  } = proposalCtrl;

  const sendMessage = useCallback(
    async (text = draft) => {
      if (!text.trim() || thinking || busy || proposal || sendLock.current)
        return;
      sendLock.current = true;
      setThinking(true);
      const message = text.trim();
      try {
        let next = state;
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
              pending.contextTaskId === context &&
              state.messages.at(-1)?.role === "user" &&
              state.messages.at(-1)?.text === message
            ) {
              idempotencyKey = pending.key;
            } else {
              next = await h.commit(
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
            next = await h.commit(
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
          }
        } else {
          next = await h.commit(
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
        }
        setDraft("");
        let answer: {
          reply: string;
          actions: Action[];
          explicitActions?: Action[];
          clarification?: {
            question: string;
            unresolvedPart?: string | null;
          } | null;
          proposal?: {
            summary: string;
            proposedActions: Action[];
          } | null;
          basedOnRevision?: number;
          turnId?: string;
        };
        if (mode === "local") answer = demoReply(message, next, context);
        else {
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
          if (!response.ok) throw new Error(data.error);
          if (data.basedOnRevision !== h.currentRevision()) {
            sessionStorage.removeItem(CHAT_PENDING_KEY);
            throw new Error(
              "המידע השתנה בזמן השיחה. לא בוצעו שינויים; אפשר לשלוח שוב.",
            );
          }
          answer = data;
        }
        const assistantText =
          answer.clarification?.question &&
          !answer.reply.includes(answer.clarification.question)
            ? `${answer.reply}\n\n${answer.clarification.question}`
            : answer.reply;
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
        sessionStorage.removeItem(CHAT_PENDING_KEY);
        sessionStorage.removeItem(CHAT_UI_KEY);
        const actions = answer.explicitActions ?? answer.actions ?? [];
        const proposed = answer.proposal?.proposedActions?.length
          ? answer.proposal.proposedActions
          : [];
        if (actions.length) {
          if (state.profile.autoApply && !requiresConfirmation(actions))
            await h.commit(actions, false, true, {
              turnId: idempotencyKey,
              sealTurn: true,
            });
          else {
            proposalRevision.current = h.currentRevision();
            setProposal(actions);
            sessionStorage.setItem(
              CHAT_UI_KEY,
              JSON.stringify({
                proposal: actions,
                revision: proposalRevision.current,
                at: Date.now(),
              }),
            );
            await h.commit(
              [
                {
                  type: "operation.record",
                  turnId: idempotencyKey,
                  summary: "proposal_pending",
                  actionTypes: actions.map((a) => a.type),
                },
              ],
              false,
              true,
              { turnId: idempotencyKey, sealTurn: true },
            );
          }
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
        if (proposed.length) {
          proposalRevision.current = h.currentRevision();
          setProposal((prev) => [...(prev ?? []), ...proposed]);
          sessionStorage.setItem(
            CHAT_UI_KEY,
            JSON.stringify({
              proposal: [
                ...(actions.length &&
                !(state.profile.autoApply && !requiresConfirmation(actions))
                  ? actions
                  : []),
                ...proposed,
              ],
              revision: proposalRevision.current,
              at: Date.now(),
            }),
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "השיחה התעכבה.";
        h.setError(msg);
        setDraft(message);
        sessionStorage.setItem(
          CHAT_UI_KEY,
          JSON.stringify({ error: msg, at: Date.now() }),
        );
      } finally {
        sendLock.current = false;
        setThinking(false);
      }
    },
    [
      draft,
      thinking,
      busy,
      proposal,
      state,
      mode,
      context,
      h,
      proposalRevision,
      setProposal,
    ],
  );

  return {
    sendMessage,
    approveProposal,
    rejectProposal,
    isThinking: thinking,
    draft,
    setDraft,
    proposal,
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
