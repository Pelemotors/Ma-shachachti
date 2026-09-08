"use client";
import { useRef, useState, useCallback, useEffect } from "react";
import { Action, ActionBatch } from "@/lib/model";
import { authFetch } from "@/lib/supabase-browser";
import { useHousehold } from "@/lib/use-household";
import { classifyTaskDuplicate } from "@/lib/domain/tasks/dedupe";

export const CHAT_UI_KEY = "ma-shachachti:chat-ui:v1";

type Household = ReturnType<typeof useHousehold>;

export type ProposalUiState = {
  proposalId: string | null;
  actions: Action[];
  summary: string;
  similarHints: { title: string; existingTitle: string }[];
  sourceRevision: number;
};

export function useProposalController(
  h: Household,
  opts: {
    mode: Household["mode"];
    onRestored?: () => void;
  },
) {
  const [proposal, setProposal] = useState<Action[] | null>(null);
  const [proposalMeta, setProposalMeta] = useState<{
    proposalId: string | null;
    summary: string;
    similarHints: { title: string; existingTitle: string }[];
  }>({ proposalId: null, summary: "", similarHints: [] });
  const proposalRevision = useRef(0);
  const approveLock = useRef(false);

  const clearProposal = useCallback(() => {
    setProposal(null);
    setProposalMeta({ proposalId: null, summary: "", similarHints: [] });
    sessionStorage.removeItem(CHAT_UI_KEY);
  }, []);

  const persistProposal = useCallback(
    (
      actions: Action[],
      meta?: {
        proposalId?: string | null;
        summary?: string;
        similarHints?: { title: string; existingTitle: string }[];
        sourceRevision?: number;
      },
    ) => {
      proposalRevision.current =
        meta?.sourceRevision ?? h.currentRevision();
      setProposal(actions);
      setProposalMeta({
        proposalId: meta?.proposalId ?? null,
        summary: meta?.summary ?? "",
        similarHints: meta?.similarHints ?? [],
      });
      sessionStorage.setItem(
        CHAT_UI_KEY,
        JSON.stringify({
          proposal: actions,
          proposalId: meta?.proposalId ?? null,
          summary: meta?.summary ?? "",
          similarHints: meta?.similarHints ?? [],
          revision: proposalRevision.current,
          at: Date.now(),
        }),
      );
    },
    [h],
  );

  useEffect(() => {
    if (opts.mode === "loading" || opts.mode === "choose") return;
    let cancelled = false;
    async function restore() {
      try {
        if (opts.mode === "cloud") {
          const res = await authFetch("/api/proposals", { cache: "no-store" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          const first = (data.proposals as Array<{
            id: string;
            payload: {
              summary?: string;
              proposedActions?: unknown;
              similarHints?: { title: string; existingTitle: string }[];
            };
            source_revision: number;
          }>)?.[0];
          if (first && !cancelled) {
            const parsed = ActionBatch.safeParse(
              first.payload?.proposedActions,
            );
            if (parsed.success && parsed.data.length) {
              persistProposal(parsed.data, {
                proposalId: first.id,
                summary: first.payload.summary,
                similarHints: first.payload.similarHints,
                sourceRevision: first.source_revision,
              });
              opts.onRestored?.();
              return;
            }
          }
        }
        const raw = sessionStorage.getItem(CHAT_UI_KEY);
        if (!raw || cancelled) return;
        const saved = JSON.parse(raw) as {
          proposal?: unknown;
          proposalId?: string | null;
          summary?: string;
          similarHints?: { title: string; existingTitle: string }[];
          revision?: number;
          error?: string;
          at?: number;
        };
        if (saved.error && saved.at && Date.now() - saved.at < 60 * 60 * 1000)
          h.setError(saved.error);
        if (saved.proposal) {
          const parsed = ActionBatch.safeParse(saved.proposal);
          if (parsed.success) {
            // Revalidate against current state — do not drop whole proposal on revision drift.
            const kept = parsed.data.filter((a) => {
              if (a.type !== "task.create") return true;
              try {
                return true;
              } catch {
                return false;
              }
            });
            if (kept.length) {
              persistProposal(kept, {
                proposalId: saved.proposalId,
                summary: saved.summary,
                similarHints: saved.similarHints,
                sourceRevision: saved.revision ?? h.currentRevision(),
              });
              opts.onRestored?.();
            } else clearProposal();
          }
        }
      } catch {
        /* keep UI usable */
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.mode]);

  const removeProposalAction = useCallback(
    (index: number) => {
      if (!proposal) return;
      const next = proposal.filter((_, i) => i !== index);
      if (!next.length) {
        clearProposal();
        return;
      }
      persistProposal(next, {
        proposalId: proposalMeta.proposalId,
        summary:
          next.filter((a) => a.type === "task.create").length === 1
            ? "זיהיתי משימה אחת. להוסיף אותה לרשימת המשימות?"
            : `זיהיתי ${next.filter((a) => a.type === "task.create").length} משימות. להוסיף אותן לרשימת המשימות?`,
        similarHints: proposalMeta.similarHints,
        sourceRevision: proposalRevision.current,
      });
    },
    [proposal, proposalMeta, persistProposal, clearProposal],
  );

  const approveProposal = useCallback(async () => {
    if (!proposal || approveLock.current) return;
    approveLock.current = true;
    try {
      if (opts.mode === "cloud" && proposalMeta.proposalId) {
        const key = crypto.randomUUID();
        const res = await authFetch("/api/proposals/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposalId: proposalMeta.proposalId,
            actions: proposal,
            idempotencyKey: key,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        h.adoptRemote(data.state, data.revision);
        clearProposal();
        h.setNotice(data.notice || "השינוי נשמר");
        return;
      }

      // Local / fallback: revalidate then commit
      const applicable: Action[] = [];
      const skipped: Action[] = [];
      for (const a of proposal) {
        if (a.type === "task.create") {
          const match = classifyTaskDuplicate(h.state, {
            title: a.task.title,
            kind: a.task.kind,
            categoryId: a.task.categoryId,
            detailTypeId: a.task.detailTypeId,
            templateId: a.task.templateId,
            dueAt: a.task.dueAt,
          });
          if (match.confidence === "exact" || match.confidence === "canonical") {
            skipped.push(a);
            continue;
          }
        }
        applicable.push(a);
      }
      if (applicable.length) await h.commit(applicable, true);
      clearProposal();
      const added = applicable.filter((a) => a.type === "task.create").length;
      const skip = skipped.filter((a) => a.type === "task.create").length;
      if (added && skip)
        h.setNotice(`נוספו ${added} משימות. ${skip} כבר היו ברשימה.`);
      else if (added)
        h.setNotice(added === 1 ? "נוספה משימה אחת." : `נוספו ${added} משימות.`);
      else if (skip) h.setNotice("המשימות כבר היו ברשימה.");
    } catch (e) {
      h.setError(e instanceof Error ? e.message : "לא נשמר");
    } finally {
      approveLock.current = false;
    }
  }, [proposal, proposalMeta, opts.mode, h, clearProposal]);

  const rejectProposal = useCallback(async () => {
    try {
      if (opts.mode === "cloud" && proposalMeta.proposalId) {
        await authFetch("/api/proposals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: proposalMeta.proposalId,
            status: "declined",
          }),
        });
      }
    } catch {
      /* local clear still happens */
    }
    clearProposal();
  }, [opts.mode, proposalMeta.proposalId, clearProposal]);

  return {
    proposal,
    setProposal,
    proposalMeta,
    proposalRevision,
    persistProposal,
    clearProposal,
    approveProposal,
    rejectProposal,
    removeProposalAction,
  };
}

export type ProposalController = ReturnType<typeof useProposalController>;
