"use client";
import { useState, useCallback } from "react";
import { durationToMinutes } from "@/components/duration-wheel";
import type { useHousehold } from "@/lib/use-household";
import { useAgentSurfaceTurn } from "./use-agent-surface-turn";

type Household = ReturnType<typeof useHousehold>;

export function useFreeTimeController(opts: {
  household: Household;
  persistServerProposal?: (data: unknown) => boolean;
  sendLock: { current: boolean };
}) {
  const [minutes, setMinutes] = useState(30);
  const [effort, setEffort] = useState(2);
  const [freeHours, setFreeHours] = useState(0);
  const [freeMinsPart, setFreeMinsPart] = useState(30);
  const turn = useAgentSurfaceTurn({
    household: opts.household,
    persistServerProposal: opts.persistServerProposal,
    sendLock: opts.sendLock,
  });

  const onDuration = useCallback(
    ({ hours, minutes: m }: { hours: number; minutes: number }) => {
      setFreeHours(hours);
      setFreeMinsPart(m);
      setMinutes(durationToMinutes(hours, m) || 5);
    },
    [],
  );

  const available = durationToMinutes(freeHours, freeMinsPart) || minutes;

  const askAgent = useCallback(() => {
    void turn.request({
      surface: "free_time",
      message: "יש לי זמן פנוי",
      availableMinutes: available,
      effort,
    });
  }, [turn, available, effort]);

  return {
    minutes,
    effort,
    setEffort,
    freeHours,
    freeMinsPart,
    onDuration,
    availableMinutes: available,
    status: turn.status,
    reply: turn.reply,
    taskIds: turn.taskIds,
    error: turn.error,
    askAgent,
  };
}

export type FreeTimeController = ReturnType<typeof useFreeTimeController>;
