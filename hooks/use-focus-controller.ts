"use client";
import { useEffect, useRef } from "react";
import type { useHousehold } from "@/lib/use-household";
import { useAgentSurfaceTurn } from "./use-agent-surface-turn";

type Household = ReturnType<typeof useHousehold>;

export function useFocusController(opts: {
  household: Household;
  persistServerProposal?: (data: unknown) => boolean;
  sendLock: { current: boolean };
  active: boolean;
}) {
  const turn = useAgentSurfaceTurn({
    household: opts.household,
    persistServerProposal: opts.persistServerProposal,
    sendLock: opts.sendLock,
  });
  const visit = useRef(false);

  useEffect(() => {
    if (!opts.active) {
      visit.current = false;
      return;
    }
    if (visit.current) return;
    visit.current = true;
    void turn.request({
      surface: "focus",
      message: "מה שכחתי?",
    });
  }, [opts.active, turn.request]);

  return {
    status: turn.status,
    reply: turn.reply,
    taskIds: turn.taskIds,
    error: turn.error,
    retry: () =>
      void turn.request({
        surface: "focus",
        message: "מה שכחתי?",
      }),
  };
}

export type FocusController = ReturnType<typeof useFocusController>;
