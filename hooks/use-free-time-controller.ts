"use client";
import { useState, useCallback } from "react";
import { opportunities, freeTimeV2 } from "@/lib/engine";
import { durationToMinutes } from "@/components/duration-wheel";
import { AppState } from "@/lib/model";

export function useFreeTimeController(opts: { state: AppState; clock: Date }) {
  const [minutes, setMinutes] = useState(20);
  const [effort, setEffort] = useState(2);
  const [freeHours, setFreeHours] = useState(0);
  const [freeMinsPart, setFreeMinsPart] = useState(20);

  const onDuration = useCallback(
    ({ hours, minutes: m }: { hours: number; minutes: number }) => {
      setFreeHours(hours);
      setFreeMinsPart(m);
      setMinutes(durationToMinutes(hours, m) || 5);
    },
    [],
  );

  const free = freeTimeV2(
    opts.state,
    durationToMinutes(freeHours, freeMinsPart) || minutes,
    effort,
    opts.clock,
  );
  const legacyFree = opportunities(opts.state, minutes, effort, opts.clock);

  return {
    minutes,
    effort,
    setEffort,
    freeHours,
    freeMinsPart,
    onDuration,
    free,
    legacyFree,
  };
}

export type FreeTimeController = ReturnType<typeof useFreeTimeController>;
