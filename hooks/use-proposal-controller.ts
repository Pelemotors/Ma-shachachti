"use client";
import { useRef, useState, useCallback, useEffect } from "react";
import { Action, ActionBatch } from "@/lib/model";
import { useHousehold } from "@/lib/use-household";

export const CHAT_UI_KEY = "ma-shachachti:chat-ui:v1";

type Household = ReturnType<typeof useHousehold>;

export function useProposalController(
  h: Household,
  opts: {
    mode: Household["mode"];
    onRestored?: () => void;
  },
) {
  const [proposal, setProposal] = useState<Action[] | null>(null);
  const proposalRevision = useRef(0);

  useEffect(() => {
    if (opts.mode === "loading" || opts.mode === "choose") return;
    try {
      const raw = sessionStorage.getItem(CHAT_UI_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        proposal?: unknown;
        revision?: number;
        error?: string;
        at?: number;
      };
      if (saved.error && saved.at && Date.now() - saved.at < 60 * 60 * 1000)
        h.setError(saved.error);
      if (saved.proposal && saved.revision === h.currentRevision()) {
        const parsed = ActionBatch.safeParse(saved.proposal);
        if (parsed.success) {
          proposalRevision.current = saved.revision;
          setProposal(parsed.data);
          opts.onRestored?.();
        }
      }
    } catch {
      sessionStorage.removeItem(CHAT_UI_KEY);
    }
    // Restore once after mode settles; household setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.mode]);

  const persistProposal = useCallback(
    (actions: Action[]) => {
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
    },
    [h],
  );

  const clearProposal = useCallback(() => {
    setProposal(null);
    sessionStorage.removeItem(CHAT_UI_KEY);
  }, []);

  const approveProposal = useCallback(async () => {
    if (!proposal) return;
    try {
      if (proposalRevision.current !== h.currentRevision()) {
        clearProposal();
        throw new Error("המידע השתנה מאז ההצעה. יש לבקש הצעה חדשה.");
      }
      await h.commit(proposal, true);
      clearProposal();
    } catch (e) {
      h.setError(e instanceof Error ? e.message : "לא נשמר");
    }
  }, [proposal, h, clearProposal]);

  const rejectProposal = useCallback(() => {
    clearProposal();
  }, [clearProposal]);

  return {
    proposal,
    setProposal,
    proposalRevision,
    persistProposal,
    clearProposal,
    approveProposal,
    rejectProposal,
  };
}

export type ProposalController = ReturnType<typeof useProposalController>;
